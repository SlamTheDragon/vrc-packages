import { cleanTitle, extractBracketTokens } from "vrc-packages-network/catalog-hygiene";
import type {
  NodeAvatarCompatibility,
  NodeDesktopToolEvidence,
  NodeDesktopToolSubtype,
  NodeVrchatRelevance,
  Platform
} from "vrc-packages-network/node";

export interface AvatarBaseSpec {
  canonical: string;
  patterns: readonly RegExp[];
  requiresContextCue: boolean;
  figurativeTraps: readonly RegExp[];
}

export interface SemanticExtractionInput {
  platform: Platform;
  url: string;
  rawTitle: string;
  cleanSummary: string;
  rawTags?: readonly string[];
  outboundLinks?: readonly string[];
}

export interface SemanticAnalysisResult {
  normalizedTitle: string;
  bracketTokens: string[];
  platformTags?: string[];
  avatarCompatibilities: NodeAvatarCompatibility[];
  desktopToolEvidence: NodeDesktopToolEvidence | null;
  vrchatRelevance: NodeVrchatRelevance;
}

const AVATAR_BASE_REGISTRY: readonly AvatarBaseSpec[] = [
  { canonical: "Shinano", patterns: [/\bshinano\b/i, /しなの/, /シナノ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Manuka", patterns: [/\bmanuka\b/i, /マヌカ/], requiresContextCue: false, figurativeTraps: [/\bmanuka\s*honey\b/i] },
  { canonical: "Kipfel", patterns: [/\bkipfel\b/i, /キプフェル/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Kikyo", patterns: [/\bkikyo\b/i, /桔梗/, /キキョウ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Karin", patterns: [/\bkarin\b/i, /カリン/, /花凛/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Selestia", patterns: [/\bselestia\b/i, /セレスティア/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Rusk", patterns: [/\brusk\b/i, /ラスク/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Komano", patterns: [/\bkomano\b/i, /こまの/, /コマノ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Rindo", patterns: [/\brindo\b/i, /竜胆/, /リンドウ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Mamehinata", patterns: [/\bmamehinata\b/i, /まめひなた/, /マメヒナタ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Lasyusha", patterns: [/\blasyusha\b/i, /ラシューシャ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Milltina", patterns: [/\bmilltina\b/i, /ミルティナ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Kuronatu", patterns: [/\bkuronatu\b/i, /クロナツ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Shinra", patterns: [/\bshinra\b/i, /森羅/, /シンラ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Rurune", patterns: [/\brurune\b/i, /ルルネ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Nayu", patterns: [/\bnayu\b/i, /ナユ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Shino", patterns: [/\bshino\b/i, /シノ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Leefa", patterns: [/\bleefa\b/i, /リーファ/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Regulus", patterns: [/\bregulus\b/i, /レグルス/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Novabeast", patterns: [/\bnovabeast\b/i, /ノヴァビースト/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Rexouium", patterns: [/\brexouium\b/i, /レクスオウアム/], requiresContextCue: false, figurativeTraps: [] },
  { canonical: "Nardoragon", patterns: [/\bnardo(?:ragon)?\b/i, /ナルド/], requiresContextCue: false, figurativeTraps: [] },
  {
    canonical: "Maya",
    patterns: [/\bmaya\b/i, /舞夜/],
    requiresContextCue: true,
    figurativeTraps: [/\bautodesk\s*maya\b/i, /\bmaya\s*20\d\d\b/i, /\bmaya\s*(?:mel|python|rigging|scene|script|plugin)\b/i]
  },
  {
    canonical: "Grus",
    patterns: [/\bgrus\b/i, /グラス/],
    requiresContextCue: true,
    figurativeTraps: [/サングラス/, /\bsunglass(?:es)?\b/i, /\bglass(?:es)?\s*shader\b/i, /グラス(?:ウェア|シェーダー|ワイン|カップ)/]
  },
  {
    canonical: "Lime",
    patterns: [/\blime\b/i, /ライム/],
    requiresContextCue: true,
    figurativeTraps: [/\blime\s*green\b/i, /ライムグリーン/, /\blime\s*soda\b/i]
  },
  {
    canonical: "Mint",
    patterns: [/\bmint\b/i, /ミント/],
    requiresContextCue: true,
    figurativeTraps: [/\bmint\s*green\b/i, /ミントグリーン/, /\bchoco(?:late)?\s*mint\b/i, /チョコミント/]
  },
  {
    canonical: "Milk",
    patterns: [/\bmilk\b/i, /ミルク/],
    requiresContextCue: true,
    figurativeTraps: [/\bmilk\s*tea\b/i, /ミルクティー/, /\bmilk\s*shake\b/i, /\bcoconut\s*milk\b/i]
  },
  {
    canonical: "Chocolat",
    patterns: [/\bchocolat\b/i, /ショコラ/],
    requiresContextCue: true,
    figurativeTraps: [/\bchocolat(?:e)?\s*(?:cake|cookie|bar|box|color|latte)\b/i]
  },
  {
    canonical: "Kokoa",
    patterns: [/\bkokoa\b/i, /ここあ/, /ココア/],
    requiresContextCue: true,
    figurativeTraps: [/hot\s*cocoa/i, /ココア(?:パウダー|味|色)/]
  },
  {
    canonical: "Chiffon",
    patterns: [/\bchiffon\b/i, /シフォン/],
    requiresContextCue: true,
    figurativeTraps: [/シフォンケーキ/, /\bchiffon\s*(?:cake|fabric)\b/i]
  },
  {
    canonical: "Moe",
    patterns: [/\bmoe\b/i, /もえ/],
    requiresContextCue: true,
    figurativeTraps: []
  },
  {
    canonical: "Air",
    patterns: [/\bair\b/i, /エア/],
    requiresContextCue: true,
    figurativeTraps: [/\bair\s*(?:brush|conditioner|guitar|plane|craft|port|drop)\b/i, /エア(?:ブラシ|コン|ギター|リアル)/]
  },
  {
    canonical: "Anon",
    patterns: [/\banon\b/i, /アノン/],
    requiresContextCue: true,
    figurativeTraps: [/\banonymous\b/i]
  },
  {
    canonical: "Sio",
    patterns: [/\bsio\b/i, /しお/, /シオ/],
    requiresContextCue: true,
    figurativeTraps: []
  },
  {
    canonical: "Mayu",
    patterns: [/\bmayu\b/i, /まゆ/, /マユ/],
    requiresContextCue: true,
    figurativeTraps: []
  }
];

const COMPATIBILITY_CUES: readonly RegExp[] = [
  /対応/,
  /向け/,
  /専用/,
  /想定/,
  /着せ替え/,
  /互換/,
  /\bfit(?:ted)?\s+(?:for|to)\b/i,
  /\brigged\s+for\b/i,
  /\bcompatible\s+with\b/i,
  /\bdesigned\s+for\b/i,
  /\bfor\s+(?:the\s+)?[A-Z][a-z]+\b/,
  /\bavatar\b/i,
  /アバター/
];

const UNIVERSAL_COMPATIBILITY_PATTERNS: readonly RegExp[] = [
  /全アバター対応/,
  /各アバター対応/,
  /汎用(?:衣装|アバター|モデル|ギミック)?/,
  /\ball\s+avatars?\b/i,
  /\buniversal\s+(?:avatar|fit|rig)\b/i
];

const POSITIVE_VRCHAT_SIGNALS: ReadonlyArray<{ id: string; pattern: RegExp; weight: number }> = [
  { id: "vrchat", pattern: /\bvrchat\b/i, weight: 0.55 },
  { id: "vrc", pattern: /\bvrc\b|vrc想定|vrc向け/i, weight: 0.4 },
  { id: "udon", pattern: /\budon(?:sharp)?\b|\bcyan\s*trigger\b/i, weight: 0.45 },
  { id: "vpm_vcc", pattern: /\bvpm\b|\bvcc\b|creator\s*companion/i, weight: 0.4 },
  { id: "avatar_tech", pattern: /\bphysbone(?:s)?\b|\bmodular\s*avatar\b|\bvrcfury\b|\bavatars?\s*3\.0\b|\bav3\b|\bsdk3\b|ma対応|vrcfury対応/i, weight: 0.45 },
  { id: "avatar_terms", pattern: /3d(?:衣装|アバター|モデル)|アバター(?:改変|向け|対応|専用)|改変/i, weight: 0.35 },
  { id: "quest_compat", pattern: /quest対応|\bquest\s+compatible\b/i, weight: 0.25 },
  { id: "osc_ft", pattern: /\bvrcft\b|face\s*tracking.*vrchat|vrchat.*osc|\bosc\b.*vrchat/i, weight: 0.4 }
];

const NEGATIVE_NON_VRCHAT_SIGNALS: ReadonlyArray<{ id: string; pattern: RegExp; weight: number }> = [
  { id: "autodesk_maya", pattern: /\bautodesk\s*maya\b|\bmaya\s*20\d\d\b/i, weight: 0.6 },
  { id: "blender_only", pattern: /\bblender\b/i, weight: 0.25 },
  { id: "unreal_only", pattern: /\bunreal\s*engine\b|\bue[45]\b/i, weight: 0.4 },
  { id: "other_games", pattern: /\b(?:roblox|minecraft|godot|genshin|fivem|garry'?s\s*mod|second\s*life)\b/i, weight: 0.5 },
  { id: "unrelated_food_fashion", pattern: /\b(?:sunglasses?|eyeglasses?)\b|サングラス|ミルクティー|チョコミント/i, weight: 0.35 }
];

const UNITY_OR_ASSET_EXCLUDE =
  /\b(?:unitypackage|vpmDependencies|modular\s*avatar|vrcfury|shader|3d衣装|3dモデル|avatar\s*outfit)\b/i;

/**
 * Layered semantic analyzer that extracts structural wrappers and contextual signals BEFORE lexical trimming.
 */
export class SemanticPatternEngine {
  /**
   * Executes Layers 1 to 4 against unstripped raw product inputs.
   */
  public analyze(input: SemanticExtractionInput): SemanticAnalysisResult {
    const rawTitle = (input.rawTitle || "").trim();
    const bracketTokens = extractBracketTokens(rawTitle);
    const platformTags = this.normalizePlatformTags(input.rawTags);
    const combinedText = [
      rawTitle.normalize("NFKC"),
      bracketTokens.join(" "),
      (input.cleanSummary || "").normalize("NFKC"),
      (platformTags ?? []).join(" ")
    ]
      .filter(Boolean)
      .join("\n");

    const avatarCompatibilities = this.extractAvatarCompatibilities(
      rawTitle.normalize("NFKC"),
      bracketTokens,
      combinedText
    );
    const desktopToolEvidence = this.classifyDesktopTool(
      rawTitle.normalize("NFKC"),
      (input.cleanSummary || "").normalize("NFKC"),
      platformTags ?? [],
      input.outboundLinks ?? []
    );
    const vrchatRelevance = this.assessVrchatRelevance(
      input.platform,
      combinedText,
      avatarCompatibilities,
      desktopToolEvidence
    );

    const trimmedTitle = cleanTitle(rawTitle).trim();
    const normalizedTitle = (trimmedTitle || rawTitle).slice(0, 500);

    return {
      normalizedTitle,
      bracketTokens,
      ...(platformTags !== undefined ? { platformTags } : {}),
      avatarCompatibilities,
      desktopToolEvidence,
      vrchatRelevance
    };
  }

  /**
   * Deduplicates, NFKC-normalizes, and bounds platform tags to the protocol limit of 50.
   */
  public normalizePlatformTags(rawTags?: readonly string[]): string[] | undefined {
    if (!rawTags || rawTags.length === 0) return undefined;
    const seen = new Set<string>();
    const out: string[] = [];

    for (const raw of rawTags) {
      if (typeof raw !== "string") continue;
      const clean = raw.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 100);
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
      if (out.length >= 50) break;
    }

    return out.length > 0 ? out : undefined;
  }

  /**
   * Layer 2: Contextual avatar compatibility extraction with figurative trap rejection.
   */
  public extractAvatarCompatibilities(
    normalizedTitle: string,
    bracketTokens: readonly string[],
    combinedText: string
  ): NodeAvatarCompatibility[] {
    const results: NodeAvatarCompatibility[] = [];
    const seen = new Set<string>();
    const hasGlobalCompatCue = COMPATIBILITY_CUES.some((pat) => pat.test(combinedText));
    const hasVrchatCue = /\b(?:vrchat|vrc|avatar|modular\s*avatar|vrcfury)\b|アバター|衣装|改変/i.test(combinedText);

    for (const spec of AVATAR_BASE_REGISTRY) {
      const matchedInBrackets = bracketTokens.some((token) => spec.patterns.some((pat) => pat.test(token)));
      const matchedAnywhere = matchedInBrackets || spec.patterns.some((pat) => pat.test(combinedText));
      if (!matchedAnywhere) continue;

      const trapped = spec.figurativeTraps.some((trap) => trap.test(combinedText));
      const matchedSpecificCompat = spec.patterns.some((pat) => {
        const src = pat.source;
        const explicitAfter = new RegExp(`(?:${src})\\s*(?:対応|向け|専用|想定|互換|fit|compatible|avatar)`, "i");
        const explicitBefore = new RegExp(`(?:for|fit\\s+for|compatible\\s+with|対応)\\s*(?:${src})`, "i");
        return explicitAfter.test(combinedText) || explicitBefore.test(combinedText);
      });

      if (trapped && !matchedSpecificCompat) {
        continue;
      }

      if (spec.requiresContextCue && !matchedSpecificCompat && !(matchedInBrackets && (hasGlobalCompatCue || hasVrchatCue))) {
        continue;
      }

      const key = `${spec.canonical.toLowerCase()}::named_base`;
      if (seen.has(key)) continue;
      seen.add(key);

      const confidence: NodeAvatarCompatibility["confidence"] =
        matchedSpecificCompat || matchedInBrackets || hasGlobalCompatCue ? "creator_declared" : "keyword_inferred";
      const evidenceSource = matchedInBrackets
        ? "title_bracket"
        : spec.patterns.some((pat) => pat.test(normalizedTitle))
          ? "title_text"
          : "description_or_tags";

      results.push({
        targetAvatarBase: spec.canonical,
        scope: "named_base",
        confidence,
        evidenceSource
      });
      if (results.length >= 50) break;
    }

    if (results.length < 50 && UNIVERSAL_COMPATIBILITY_PATTERNS.some((pat) => pat.test(combinedText))) {
      results.push({
        targetAvatarBase: "universal",
        scope: "universal",
        confidence: "creator_declared",
        evidenceSource: "compatibility_declaration"
      });
    }

    return results.slice(0, 50);
  }

  /**
   * Layer 3a: Identifies native desktop tools vs in-game Unity assets.
   */
  public classifyDesktopTool(
    normalizedTitle: string,
    cleanSummary: string,
    platformTags: readonly string[],
    outboundLinks: readonly string[]
  ): NodeDesktopToolEvidence | null {
    const text = [normalizedTitle, cleanSummary, platformTags.join(" ")].filter(Boolean).join("\n");
    if (!text) return null;

    const subtype = this.detectDesktopToolSubtype(text);
    if (!subtype) return null;

    // Exclude Unity/avatar/clothing listings unless strong standalone executable cues appear.
    const hasStandaloneRuntimeCue =
      /\b(?:standalone|desktop\s+app(?:lication)?|\.exe\b|overlay|tray\s+app|osc\s+(?:server|router|bridge|tool)|vrcft\s+module|companion\s+app)\b/i.test(text);
    if (UNITY_OR_ASSET_EXCLUDE.test(text) && !hasStandaloneRuntimeCue) {
      return null;
    }

    const supportedOS = this.detectSupportedOs(text);
    if (supportedOS.length === 0) {
      return null;
    }

    const particularVRChatTarget = /\b(?:vrchat|vrcft|vrc|avatar|world)\b/i.test(text);
    const evidenceUrl = outboundLinks.find((link) => {
      try {
        return new URL(link).protocol === "https:";
      } catch {
        return false;
      }
    });

    const claim = (cleanSummary.split("\n")[0] || normalizedTitle).trim().slice(0, 300);
    return {
      toolSubtype: subtype,
      supportedOS,
      particularVRChatTarget,
      ...(evidenceUrl ? { evidenceUrl } : {}),
      publisherClaim: claim
    };
  }

  /**
   * Layer 3b: Scores VRChat relevance vs non-VRChat false positives so worker retains clean auditability.
   */
  public assessVrchatRelevance(
    platform: Platform,
    combinedText: string,
    avatarCompatibilities: readonly NodeAvatarCompatibility[],
    desktopToolEvidence: NodeDesktopToolEvidence | null
  ): NodeVrchatRelevance {
    if (platform === "vpm") {
      return {
        isRelevant: true,
        confidence: 1,
        matchedSignals: ["vpm_ecosystem"]
      };
    }

    const matchedSignals: string[] = [];
    let score = 0;

    if (platform === "jinxxy") {
      score += 0.35;
      matchedSignals.push("jinxxy_marketplace");
    }

    for (const sig of POSITIVE_VRCHAT_SIGNALS) {
      if (sig.pattern.test(combinedText)) {
        score += sig.weight;
        matchedSignals.push(sig.id);
      }
    }

    if (avatarCompatibilities.length > 0) {
      score += 0.4;
      matchedSignals.push("avatar_compatibility");
    }
    if (desktopToolEvidence?.particularVRChatTarget) {
      score += 0.3;
      matchedSignals.push("desktop_vrc_tool");
    }

    const negativeMatches: string[] = [];
    let penalty = 0;
    for (const neg of NEGATIVE_NON_VRCHAT_SIGNALS) {
      if (neg.pattern.test(combinedText)) {
        penalty += neg.weight;
        negativeMatches.push(neg.id);
      }
    }

    const netScore = Math.max(0, Math.min(1, score - (matchedSignals.length > 0 ? penalty * 0.5 : penalty)));
    const isRelevant = netScore >= 0.35 || matchedSignals.some((s) => s === "vrchat" || s === "vpm_vcc" || s === "avatar_compatibility");

    return {
      isRelevant,
      confidence: Number(netScore.toFixed(2)),
      ...(matchedSignals.length > 0 ? { matchedSignals: matchedSignals.slice(0, 20) } : {}),
      ...(!isRelevant
        ? {
            rejectionReason:
              negativeMatches.length > 0
                ? `Non-VRChat signals (${negativeMatches.join(", ")}) without VRChat compatibility evidence`
                : "No explicit VRChat ecosystem signals detected"
          }
        : {})
    };
  }

  private detectDesktopToolSubtype(text: string): NodeDesktopToolSubtype | null {
    if (/\b(?:vrcx|companion\s+(?:app|client|tool)|desktop\s+client)\b/i.test(text)) {
      return "companion_client";
    }
    if (/\b(?:osc\s+(?:tool|bridge|router|app|chatbox|sender|receiver)|vrchat\s*osc)\b/i.test(text)) {
      return "osc_control";
    }
    if (/\b(?:vrcft|face\s*tracking|eye\s*tracking|full\s*body\s*tracking|slimevr|mocopi|tracking\s*bridge)\b/i.test(text)) {
      return "tracking_bridge";
    }
    if (/\b(?:xs\s*overlay|ovr\s*toolkit|stream(?:ing)?\s+overlay|caption(?:ing)?\s+overlay|speech\s+to\s+text)\b/i.test(text)) {
      return "streaming_accessibility";
    }
    if (/\b(?:desktop\s+(?:app|application|utility)|vrc-get|alcom|creator\s+companion\s+cli)\b/i.test(text)) {
      return "utility";
    }
    return null;
  }

  private detectSupportedOs(text: string): Array<"windows" | "linux" | "macos"> {
    const out: Array<"windows" | "linux" | "macos"> = [];
    if (/\bwindows\b|\bwin(?:32|64|10|11)\b|\.exe\b/i.test(text)) out.push("windows");
    if (/\blinux\b|\bappimage\b|\.deb\b|\bflatpak\b/i.test(text)) out.push("linux");
    if (/\bmacos\b|\bos\s*x\b|\.dmg\b|\.app\b/i.test(text)) out.push("macos");
    if (out.length === 0 && /\b(?:overlay|standalone|companion|cli|desktop\s+app)\b/i.test(text)) {
      out.push("windows");
    }
    return out;
  }
}

export const semanticEngine = new SemanticPatternEngine();
