import type { ItemEffect } from "./api";

/** "정령석 커스텀 기능 해방" 아이템을 쓴 직후 보여주는 사용법 안내. */
export const SPIRIT_STONE_CUSTOMIZE_GUIDE = {
  title: "정령석 커스텀 기능이 해방되었습니다",
  description: [
    "이제 보유한 정령석의 이미지와 설명을 직접 바꿀 수 있어요.",
    "",
    "1. 캐릭터 정보의 '보유 중인 아이템'에서 정령석에 커서를 올리세요. 장착 중인 정령석은 동반자·장신구 슬롯에 커서를 올리면 됩니다.",
    "2. 툴팁 아래의 '커스텀하기'를 누르세요.",
    "3. '이미지 바꾸기'로 이미지를 올리고, 설명을 입력한 뒤 '설명 저장'을 누르세요.",
    "",
    "설명을 비우면 원래 설명으로, '원래 이미지로'를 누르면 원래 이미지로 돌아갑니다. 나중에 얻는 정령석도 같은 방법으로 커스텀할 수 있어요.",
  ].join("\n"),
  maxWidthClassName: "max-w-md",
};

export function unlocksSpiritStoneCustomization(effects: ItemEffect[]): boolean {
  return effects.some((effect) => effect.stat === "spirit_stone_customize");
}
