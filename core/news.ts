import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@shared/types";
import { cached, getText, mapLimit } from "./http";

const FEEDS = [
  { source: "InfoMoney", url: "https://www.infomoney.com.br/feed/" },
  { source: "Money Times", url: "https://www.moneytimes.com.br/feed/" },
  { source: "g1 Economia", url: "https://g1.globo.com/rss/g1/economia/" },
  { source: "Exame", url: "https://exame.com/feed/" },
  { source: "CNN Brasil Economia", url: "https://www.cnnbrasil.com.br/economia/feed/" },
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v && "#text" in v) return String((v as Record<string, unknown>)["#text"] ?? "");
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function pickImage(item: any): string | undefined {
  const media = item["media:content"] ?? item["media:thumbnail"];
  const m = Array.isArray(media) ? media[0] : media;
  const url = m?.["@_url"] ?? item.enclosure?.["@_url"];
  if (typeof url === "string" && url.startsWith("https://")) return url;
  const desc = text(item.description) + text(item["content:encoded"]);
  const match = /<img[^>]+src=["'](https:[^"']+)["']/i.exec(desc);
  return match?.[1];
}

async function loadFeed(feed: { source: string; url: string }): Promise<NewsItem[]> {
  const xml = await getText(feed.url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } }, 12_000);
  const doc = parser.parse(xml);
  const items: any[] = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
  const list = Array.isArray(items) ? items : [items];
  return list.slice(0, 25).map((item) => {
    const title = stripHtml(text(item.title));
    const link = typeof item.link === "string" ? item.link : item.link?.["@_href"] ?? text(item.link);
    const date = text(item.pubDate) || text(item.published) || text(item.updated) || text(item["dc:date"]);
    const summary = stripHtml(text(item.description) || text(item.summary)).slice(0, 280);
    const publishedAt = date ? new Date(date).toISOString() : new Date().toISOString();
    return { id: hash(link || title), title, link, source: feed.source, publishedAt, summary: summary || undefined, image: pickImage(item) };
  });
}

export async function getNews(): Promise<NewsItem[]> {
  return cached("news", 10 * 60_000, async () => {
    const results = await mapLimit(FEEDS, 5, (f) => loadFeed(f).catch(() => [] as NewsItem[]));
    const all = results.flat().filter((n) => n.title && n.link?.startsWith("http"));
    if (!all.length) throw new Error("Nenhuma fonte de notícias respondeu");
    const seen = new Set<string>();
    return all
      .filter((n) => {
        const key = n.title.toLowerCase().slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((n) => !Number.isNaN(Date.parse(n.publishedAt)))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 60);
  });
}
