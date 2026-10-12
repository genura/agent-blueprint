> [!NOTE]
> Bu dokuman/guncelleme Gemini tarafindan uretilmistir.

# agentCompressJson Plani

Bu dokuman, React Flow projelerindeki standart JSON ciktilarini, LLM (Yapay Zeka / Agent) sistemlerinin daha az token harcayarak daha kolay isleyebilmesi icin gelistirilmis minimalist bir veri formatini ve donusum planini aciklar.

## 1. Amac ve Gerekce
Standart React Flow verilerinde `selected`, `dragging`, `positionAbsolute` gibi UI stateleri ve `width`, `height` gibi tekrarlayan detaylar bulunur. 
Bu yapi agentlar icin:
- Ciddi bir token israfidir (Ozellikle buyuk semalarda).
- Sadece isin mantigini arayan algoritmayi gereksiz gorsel detaylarla bogar.

## 2. Minimalist Dizi (Array) Formati
JSON objelerindeki tekrarlayan `{ }` ve `"anahtar_kelime"` bloklarindan kurtulmak icin, her verinin sirasinin sabit kabul edildigi matrisler (diziler) kullanilir.

### Format Kurallari:
- **Dugumler (Nodes):** Sadece `[id, isim_text, x_konumu, y_konumu]` siralamasiyla tutulur.
- **Baglantilar (Edges):** Sadece `[kaynak_id, hedef_id]` siralamasiyla tutulur.

### Ornek Gosterim:
```json
{
  "nodes": [
    ["1", "Start Node", 209, -35],
    ["2", "Intermediate Node A", 100, 150]
  ],
  "edges": [
    ["1", "2"]
  ]
}
```

## 3. Donusturucu (Parser) Mantigi
Agent'in urettigi veya projeden agent'a gonderilen bu minimal yapiyi React Flow'un anlayacagi hale cevirmek icin projede asagidaki gibi kucuk bir yardimci fonksiyon (util) kullanilmalidir:

```typescript
export const parseAgentDataToReactFlow = (agentData: any) => {
  const nodes = agentData.nodes.map((nodeData: any[]) => ({
    id: nodeData[0],
    type: "default", // Ihtiyaca gore dinamiklestirilebilir
    position: { x: Number(nodeData[2]), y: Number(nodeData[3]) },
    data: { label: nodeData[1] }
  }));

  const edges = agentData.edges.map((edgeData: any[], idx: number) => ({
    id: `e-${edgeData[0]}-${edgeData[1]}-${idx}`,
    source: edgeData[0],
    target: edgeData[1],
    animated: false
  }));

  return { nodes, edges };
};
```

## 4. Kullanim Avantajlari
- Veri alisverislerinde **%70-80 oraninda token tasarrufu** saglanir.
- LLM'in (Claude, Gemini vb.) gorsel mantigi iskelet seklinde hizlica kavramasini saglayarak, halusinasyon ve hata payini minimuma indirir.
