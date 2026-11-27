import { MAX_JOB_URL_LENGTH, type CrawlJob, type DiscoveryLead, type ResultOutcome } from "vrc-packages-network/node";

export type DiscoveryOutcome = Extract<ResultOutcome, { kind: "discovery" }>;

const MAX_DISCOVERY_LEADS = 100;

/**
 * Bounds multi-page discovery batches cleanly to at most 100 unique leads while forwarding a
 * single validated `nextPageLead` whenever pagination depth permits.
 */
export class PaginationController {
  public buildDiscoveryOutcome(
    job: CrawlJob,
    rawLeads: readonly DiscoveryLead[],
    nextPageCandidate: string | null,
    validateNextPage: (url: string) => boolean
  ): DiscoveryOutcome {
    const deduped = new Map<string, DiscoveryLead>();
    for (const lead of rawLeads) {
      const key = `${lead.kind}:${lead.url}:${lead.claimedPackageId || ""}`;
      if (!deduped.has(key)) {
        deduped.set(key, lead);
        if (deduped.size >= MAX_DISCOVERY_LEADS) break;
      }
    }

    const currentDepth = job.paginationDepth ?? 0;
    const maxDepth = job.maxPaginationDepth ?? 0;
    let nextPageLead: string | undefined;

    if (
      nextPageCandidate &&
      currentDepth < maxDepth &&
      nextPageCandidate !== job.url &&
      nextPageCandidate.length <= MAX_JOB_URL_LENGTH &&
      validateNextPage(nextPageCandidate)
    ) {
      nextPageLead = nextPageCandidate;
    }

    return {
      kind: "discovery",
      leads: [...deduped.values()],
      ...(nextPageLead !== undefined ? { nextPageLead } : {})
    };
  }
}

export const paginationController = new PaginationController();
