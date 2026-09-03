import Image from "next/image";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  src: string | null;
  alt: string;
  /** 크기·모서리 등 형태 클래스 (예: "size-8 rounded-lg"). */
  className?: string;
  iconSize?: number;
  /**
   * next/image의 sizes. 실제 렌더링 폭보다 작게 잡으면 브라우저가 저해상도 srcset을
   * 골라 확대해서 흐릿/계단현상("깨짐")이 난다. `size-N`처럼 고정 픽셀이면 기본값으로
   * 충분하지만, `aspect-square w-full`처럼 그리드 셀 전체 너비를 차지하는 큰 아바타는
   * 실제 렌더 폭에 맞는 값을 넘겨야 한다.
   */
  sizes?: string;
}

/** 캐릭터 프로필 이미지. 이미지가 없으면 아이콘 플레이스홀더를 보여준다. */
export default function CharacterAvatar({ src, alt, className, iconSize = 16, sizes = "96px" }: Props) {
  if (src) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden", className)}>
        <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center bg-primary-light/20 text-muted", className)}
    >
      <ImageIcon size={iconSize} />
    </span>
  );
}
