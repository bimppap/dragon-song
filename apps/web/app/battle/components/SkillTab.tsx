"use client";

import type { Member } from "@/lib/api";
import AdminSkillEditor from "./AdminSkillEditor";
import MySkillTree from "./MySkillTree";

interface Props {
  member: Member;
}

export default function SkillTab({ member }: Props) {
  if (member.role === "ADMIN") {
    return <AdminSkillEditor />;
  }
  if (member.character_id == null) {
    return <p className="text-sm text-slate-400">캐릭터가 없어 기술트리를 표시할 수 없습니다.</p>;
  }
  return <MySkillTree characterId={member.character_id} />;
}
