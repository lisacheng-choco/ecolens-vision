import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ClassifyRequest, MunicipalityId, RegionHint } from "@/lib/schemas/classification";

export type KnowledgeChunk = {
  id: string;
  title: string;
  text: string;
  url: string;
};

const officialSources: Record<RegionHint, Record<string, string>> = {
  tw: {
    country: "https://recycle.moenv.gov.tw/",
    taipei: "https://www.laws.taipei.gov.tw/law/LawSearch/LawExport/FL020223?type=0",
    new_taipei: "https://recycle.ntpc.gov.tw/",
    taoyuan: "https://recycle.tyoem.gov.tw/",
    taichung: "https://www.epb.taichung.gov.tw/",
    tainan: "https://web.tainan.gov.tw/epb/cp.aspx?n=16262",
    kaohsiung: "https://ksepb.kcg.gov.tw/",
    keelung: "https://www.klepb.klcg.gov.tw/",
    yilan: "https://www.ilepb.gov.tw/",
    hualien: "https://www.hlepb.gov.tw/cht/",
    pingtung: "https://www.ptepb.gov.tw/",
  },
  jp: {
    country: "https://www.env.go.jp/recycle/waste/",
    shinjuku: "https://www.city.shinjuku.lg.jp/seikatsu/seiso01_001025.html",
    osaka: "https://www.city.osaka.lg.jp/kankyo/page/0000009337.html",
    kyoto: "https://www.city.kyoto.lg.jp/kankyo/page/0000309217.html",
    sapporo: "https://www.city.sapporo.jp/seiso/gomi/wakekata.html",
    fukuoka: "https://kateigomi-bunbetsu.city.fukuoka.lg.jp/",
    yokohama: "https://www.city.yokohama.lg.jp/kurashi/sumai-kurashi/gomi-recycle/gomi/shushuyobi/",
  },
};

const municipalityHeadings: Partial<Record<MunicipalityId, string>> = {
  taipei: "臺北市",
  new_taipei: "新北市",
  taoyuan: "桃園市",
  taichung: "臺中市",
  tainan: "臺南市",
  kaohsiung: "高雄市",
  keelung: "基隆市",
  yilan: "宜蘭縣",
  hualien: "花蓮縣",
  pingtung: "屏東縣",
};

let cache: Partial<Record<RegionHint, Array<{ title: string; text: string }>>> = {};

export function retrieveKnowledge(request: Pick<ClassifyRequest, "regionHint" | "municipality">) {
  const sections = loadSections(request.regionHint);
  const cityHeading = request.municipality ? municipalityHeadings[request.municipality] : undefined;
  const selected = sections.filter(({ title }) => {
    if (request.regionHint === "jp") {
      return /執行摘要|跨區制度比較|跨區常見物品分類對照表/.test(title);
    }
    return /執行摘要|中央制度|常見物品分類對照表/.test(title) ||
      Boolean(cityHeading && title === cityHeading);
  });
  const sourceKey = request.municipality ?? "country";
  const url = officialSources[request.regionHint][sourceKey] ?? officialSources[request.regionHint].country;

  return selected.map((section, index): KnowledgeChunk => ({
    id: `${request.regionHint}-${sourceKey}-${index + 1}`,
    title: section.title,
    text: stripResearchCitations(section.text),
    url,
  }));
}

export function resolveEvidence(ids: unknown, chunks: KnowledgeChunk[]) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) return null;
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const evidence = ids.map((id) => chunkById.get(id));
  return evidence.some((chunk) => !chunk) ? null : evidence as KnowledgeChunk[];
}

function loadSections(region: RegionHint) {
  if (cache[region]) return cache[region];
  const fileName = region === "tw"
    ? "tw-trash-classification-guide.md"
    : "jp-trash-classification-guide.md";
  const markdown = readFileSync(join(process.cwd(), "knowledge", fileName), "utf8");
  const sections: Array<{ title: string; text: string }> = [];
  let current: { title: string; lines: string[] } | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(##|###) (.+)$/.exec(line);
    if (heading) {
      if (current) sections.push({ title: current.title, text: current.lines.join("\n").trim() });
      current = { title: heading[2], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ title: current.title, text: current.lines.join("\n").trim() });
  cache = { ...cache, [region]: sections };
  return sections;
}

function stripResearchCitations(text: string) {
  return text.replace(/cite[^]+/g, "").trim();
}
