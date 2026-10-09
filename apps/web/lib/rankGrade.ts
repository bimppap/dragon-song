/** 모험가 등급(rank) 1~5에 대응하는 메달 패. 캐릭터 정보 카드와 추억 남기기 이미지가 함께 쓴다. */
export const RANK_GRADES = [
  {
    name: "동",
    description: "입문의 증표. 모헙가로서 첫발을 내디딘 자에게 주어지는 패.",
    medalImage: "/medal/medal_1.png",
  },
  {
    name: "은",
    description:
      "신뢰의 증표. 모험가로서 능력과 신뢰를 인정받은 자에게 주어지는 패.",
    medalImage: "/medal/medal_2.png",
  },
  {
    name: "금",
    description:
      "공훈의 증표. 탁월한 공적을 세워 길드와 사람들에게 큰 기여를 한 자에게 주어지는 패.",
    medalImage: "/medal/medal_3.png",
  },
  {
    name: "백금",
    description:
      "위업의 증표. 한 국가의 역사에 남을 만한 업적을 세운 자에게 주어지는 패.",
    medalImage: "/medal/medal_4.png",
  },
  {
    name: "용린",
    description:
      "전설의 증표. 시대의 한계를 넘어설 정도의 업적을 세운 자에게 주어지는 패.",
    medalImage: "/medal/medal_4.png",
  },
] as const;

/** 모험가 등급(rank) 1~5를 동/은/금/백금/용린 패로 바꾼다. 범위를 벗어나면 가장 가까운 등급으로 본다. */
export function getRankGrade(rank: number) {
  return RANK_GRADES[Math.min(Math.max(rank, 1), RANK_GRADES.length) - 1];
}
