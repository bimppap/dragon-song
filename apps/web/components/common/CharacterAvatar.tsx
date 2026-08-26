import Image from "next/image";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  src: string | null;
  alt: string;
  /** 크기·모서리 등 형태 클래스 (예: "size-8 rounded-lg"). */
  className?: string;
  iconSize?: number;
}

/** 캐릭터 프로필 이미지. 이미지가 없으면 아이콘 플레이스홀더를 보여준다. */
export default function CharacterAvatar({ src, alt, className, iconSize = 16 }: Props) {
  if (src) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden", className)}>
        <Image src={src} alt={alt} fill sizes="80px" className="object-cover" />
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
