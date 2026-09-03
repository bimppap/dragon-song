"""Supabase Storage 업로드 모듈.

- 업로드되는 모든 이미지는 업로드 전 WebP로 변환한다.
- 변환된 WebP가 5MB를 초과하면 에러를 낸다.

필요한 환경변수(.env):
    SUPABASE_URL=https://<project-ref>.supabase.co
    SUPABASE_SECRET_KEY=sb_secret_...   # 서버 전용 secret 키, 절대 노출 금지
    SUPABASE_BUCKET=images              # (선택) 기본값 "images"

* 새 키 체계: 백엔드는 secret 키(sb_secret_...), 브라우저는 publishable 키(sb_publishable_...).
  legacy service_role 키를 아직 쓰는 프로젝트는 SUPABASE_SERVICE_ROLE_KEY로도 인식한다.
"""

import io
import os
import re
import asyncio
import shutil
import subprocess
import tempfile
from pathlib import Path

import httpx
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

MAX_WEBP_BYTES = 5 * 1024 * 1024  # 5MB
DEFAULT_QUALITY = 90
MAX_AUDIO_BYTES = 25 * 1024 * 1024

# 캐릭터/아이템/기술 이미지처럼 URL에 "?v={timestamp}" 캐시 버스팅을 붙여 재업로드마다
# URL 자체가 바뀌는 경우에만 쓴다 - URL이 바뀌니 브라우저/CDN에 최대한 오래 캐시해도
# 안전하고(immutable), 이미지가 바뀌면 새 URL이라 자동으로 새로 받아온다.
LONG_LIVED_CACHE_CONTROL = "public, max-age=31536000, immutable"


def _secret_key() -> str | None:
    # 새 secret 키를 우선하고, 레거시 service_role 키도 허용한다.
    return os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def _env() -> tuple[str, str, str]:
    url = os.getenv("SUPABASE_URL")
    key = _secret_key()
    bucket = os.getenv("SUPABASE_BUCKET", "images")
    if not url or not key:
        raise HTTPException(
            status_code=500,
            detail="Supabase 환경변수(SUPABASE_URL / SUPABASE_SECRET_KEY)가 설정되지 않았습니다.",
        )
    return url.rstrip("/"), key, bucket


def is_configured() -> bool:
    return bool(os.getenv("SUPABASE_URL") and _secret_key())


def convert_to_webp(data: bytes, quality: int = DEFAULT_QUALITY) -> bytes:
    """이미지 바이트를 WebP 바이트로 변환한다. 유효한 이미지가 아니면 400."""
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="유효한 이미지 파일이 아닙니다.")

    # WebP는 RGB/RGBA만 저장 가능하므로 그 외 모드는 변환한다.
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")

    out = io.BytesIO()
    image.save(out, format="WEBP", quality=quality)
    return out.getvalue()


def _to_webp_key(path: str) -> str:
    """저장 경로의 확장자를 .webp로 정규화한다."""
    stem = path.rsplit(".", 1)[0] if "." in path.rsplit("/", 1)[-1] else path
    return f"{stem}.webp"


async def upload_image_to_bucket(
    path: str,
    data: bytes,
    *,
    quality: int = DEFAULT_QUALITY,
    upsert: bool = True,
    cache_control: str | None = None,
) -> dict:
    """이미지를 WebP로 변환해 Supabase Storage 버킷에 업로드한다.

    cache_control: 지정하면 그 값으로 Storage 객체의 Cache-Control 헤더를 설정한다.
    호출부가 반환된 public_url에 "?v={timestamp}" 같은 캐시 버스팅을 붙이는 경우에만
    LONG_LIVED_CACHE_CONTROL처럼 긴 값을 넘겨야 안전하다(그렇지 않으면 재업로드해도
    URL이 그대로라 오래된 이미지가 계속 캐시된다).

    반환: {"path": 버킷 내 경로, "public_url": 공개 URL}
    """
    base_url, secret_key, bucket = _env()

    webp = convert_to_webp(data, quality)
    if len(webp) > MAX_WEBP_BYTES:
        mb = len(webp) / (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"변환된 WebP 크기({mb:.2f}MB)가 최대 허용치(5MB)를 초과했습니다.",
        )

    key = _to_webp_key(path)
    endpoint = f"{base_url}/storage/v1/object/{bucket}/{key}"
    headers = {
        "apikey": secret_key,
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "image/webp",
        "x-upsert": "true" if upsert else "false",
    }
    if cache_control:
        headers["Cache-Control"] = cache_control

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(endpoint, content=webp, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"이미지 업로드 요청 실패: {exc}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"이미지 업로드 실패: {resp.text}")

    public_url = f"{base_url}/storage/v1/object/public/{bucket}/{key}"
    return {"path": key, "public_url": public_url}


def _compress_audio(data: bytes, suffix: str) -> tuple[bytes, str, str]:
    """FFmpeg가 있으면 64kbps Opus로 변환한다. 없으면 검증된 원본을 반환한다."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        mime_by_suffix = {
            ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/ogg",
            ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav",
        }
        return data, suffix, mime_by_suffix.get(suffix, "application/octet-stream")

    with tempfile.TemporaryDirectory(prefix="dragon-song-audio-") as temp_dir:
        input_path = Path(temp_dir) / f"input{suffix}"
        output_path = Path(temp_dir) / "output.ogg"
        input_path.write_bytes(data)
        result = subprocess.run(
            [ffmpeg, "-y", "-i", str(input_path), "-vn", "-c:a", "libopus", "-b:a", "64k", str(output_path)],
            capture_output=True,
            timeout=60,
            check=False,
        )
        if result.returncode != 0 or not output_path.exists():
            raise HTTPException(status_code=400, detail="음원 파일을 변환할 수 없습니다.")
        return output_path.read_bytes(), ".ogg", "audio/ogg"


async def upload_audio_to_bucket(
    path: str,
    data: bytes,
    *,
    content_type: str | None,
    filename: str | None,
) -> dict:
    """음원을 가능하면 저용량 Opus로 변환해 업로드한다."""
    if not data:
        raise HTTPException(status_code=400, detail="빈 음원 파일입니다.")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="음원 파일은 25MB 이하여야 합니다.")

    suffix = Path(filename or "").suffix.lower()
    allowed = {".mp3", ".ogg", ".opus", ".m4a", ".aac", ".wav"}
    if suffix not in allowed or not (content_type or "").startswith("audio/"):
        raise HTTPException(status_code=400, detail="지원하지 않는 음원 형식입니다.")

    audio, output_suffix, output_type = await asyncio.to_thread(_compress_audio, data, suffix)
    base_url, secret_key, bucket = _env()
    key = f"{path}{output_suffix}"
    endpoint = f"{base_url}/storage/v1/object/{bucket}/{key}"
    headers = {
        "apikey": secret_key,
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": output_type,
        "x-upsert": "true",
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(endpoint, content=audio, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"음원 업로드 요청 실패: {exc}")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"음원 업로드 실패: {response.text}")
    return {"path": key, "public_url": f"{base_url}/storage/v1/object/public/{bucket}/{key}"}


def make_key(prefix: str, entity_id: int, name: str) -> str:
    """Supabase Storage 키를 만든다. (예: item/12_healing_potion)

    Supabase 키는 ASCII 안전 문자만 허용하므로 한글 등 비ASCII는 제거하고,
    공백은 _로 바꾼다. id를 접두로 붙여 고유성을 보장한다.
    (한글 전용 이름이면 슬러그가 비어 prefix/{id} 형태가 된다.)
    """
    slug = re.sub(r"\s+", "_", (name or "").strip())
    slug = re.sub(r"[^A-Za-z0-9._-]", "", slug).strip("._-")
    return f"{prefix}/{entity_id}_{slug}" if slug else f"{prefix}/{entity_id}"


def public_url_to_path(url: str | None) -> str | None:
    """공개 URL에서 버킷 내 경로를 추출한다. (예: .../object/public/images/item/1_x.webp → item/1_x.webp)"""
    if not url:
        return None
    _, _, bucket = _env()
    marker = f"/object/public/{bucket}/"
    idx = url.find(marker)
    if idx == -1:
        return None
    return url[idx + len(marker):].split("?", 1)[0]


async def delete_from_bucket(paths: str | list[str]) -> None:
    """버킷에서 오브젝트를 삭제한다(베스트 에포트, 실패해도 예외를 던지지 않는다)."""
    base_url, secret_key, bucket = _env()
    prefixes = [paths] if isinstance(paths, str) else list(paths)
    if not prefixes:
        return
    endpoint = f"{base_url}/storage/v1/object/{bucket}"
    headers = {
        "apikey": secret_key,
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.request("DELETE", endpoint, headers=headers, json={"prefixes": prefixes})
    except httpx.HTTPError:
        pass
