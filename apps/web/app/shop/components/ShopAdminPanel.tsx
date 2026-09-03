"use client";

import { useState } from "react";
import { ClipboardList, Plus, Settings2, Truck } from "lucide-react";
import TabBar from "@/components/common/TabBar";
import Modal from "@/components/common/Modal";
import { Button } from "@/components/ui/button";
import ItemGrid from "./ItemGrid";
import PurchaseGrid from "./PurchaseGrid";
import DeliveryGrid from "./DeliveryGrid";
import AddItemForm from "./AddItemForm";
import type { Item } from "@/lib/api";

type Tab = "manage" | "purchases" | "delivery";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "manage", label: "아이템 관리", icon: Settings2 },
  { id: "purchases", label: "구매 내역", icon: ClipboardList },
  { id: "delivery", label: "배달", icon: Truck },
];

/** 상점 페이지의 "상점 관리" 버튼으로 여는 관리자용 아이템 관리/구매내역 패널. */
export default function ShopAdminPanel() {
  const [tab, setTab] = useState<Tab>("manage");
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  function openAddModal() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function openEditModal(item: Item) {
    setEditingItem(item);
    setModalOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
        {tab === "manage" && (
          <Button onClick={openAddModal} className="gap-2">
            <Plus size={15} />
            아이템 추가
          </Button>
        )}
      </div>

      {tab === "manage" && (
        <ItemGrid
          refreshKey={refreshKey}
          showAvailability
          showEffects
          onEditItem={openEditModal}
        />
      )}
      {tab === "purchases" && <PurchaseGrid refreshKey={refreshKey} />}
      {tab === "delivery" && <DeliveryGrid refreshKey={refreshKey} />}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingItem ? "아이템 수정" : "아이템 추가"}
      >
        <AddItemForm
          key={editingItem?.id ?? "create"}
          item={editingItem}
          hideHeader
          onSubmitted={() => {
            setRefreshKey((k) => k + 1);
            setModalOpen(false);
            setEditingItem(null);
          }}
          onDeleted={() => {
            setRefreshKey((k) => k + 1);
            setModalOpen(false);
            setEditingItem(null);
          }}
        />
      </Modal>
    </div>
  );
}
