"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface Character {
  id: number;
  name: string;
  hp: number;
  attack: number;
  defense: number;
}

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [form, setForm] = useState({ name: "", hp: "", attack: "", defense: "" });
  const [loading, setLoading] = useState(false);

  async function fetchCharacters() {
    const res = await fetch(`${API_URL}/characters`);
    const data = await res.json();
    setCharacters(data);
  }

  useEffect(() => {
    fetchCharacters();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch(`${API_URL}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        hp: Number(form.hp),
        attack: Number(form.attack),
        defense: Number(form.defense),
      }),
    });
    setForm({ name: "", hp: "", attack: "", defense: "" });
    await fetchCharacters();
    setLoading(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <h1>Dragon Song</h1>

      <section>
        <h2>캐릭터 생성</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input name="name" placeholder="이름" value={form.name} onChange={handleChange} required />
          <input name="hp" type="number" placeholder="HP" value={form.hp} onChange={handleChange} required />
          <input name="attack" type="number" placeholder="공격력" value={form.attack} onChange={handleChange} required />
          <input name="defense" type="number" placeholder="방어력" value={form.defense} onChange={handleChange} required />
          <button type="submit" disabled={loading}>
            {loading ? "생성 중..." : "생성"}
          </button>
        </form>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>캐릭터 목록</h2>
        {characters.length === 0 ? (
          <p>캐릭터가 없습니다.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>HP</th>
                <th style={thStyle}>공격력</th>
                <th style={thStyle}>방어력</th>
              </tr>
            </thead>
            <tbody>
              {characters.map((c) => (
                <tr key={c.id}>
                  <td style={tdStyle}>{c.id}</td>
                  <td style={tdStyle}>{c.name}</td>
                  <td style={tdStyle}>{c.hp}</td>
                  <td style={tdStyle}>{c.attack}</td>
                  <td style={tdStyle}>{c.defense}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "8px 12px",
  textAlign: "left",
  background: "#f5f5f5",
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "8px 12px",
};
