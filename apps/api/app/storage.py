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

import httpx
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

MAX_WEBP_BYTES = 5 * 1024 * 1024  # 5MB
DEFAULT_QUALITY = 90


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
) -> dict:
    """이미지를 WebP로 변환해 Supabase Storage 버킷에 업로드한다.

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

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(endpoint, content=webp, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"이미지 업로드 요청 실패: {exc}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"이미지 업로드 실패: {resp.text}")

    public_url = f"{base_url}/storage/v1/object/public/{bucket}/{key}"
    return {"path": key, "public_url": public_url}
