import type { Platform } from "vrc-packages-network/node";
import { GitHubDriver } from "./github_driver.ts";
import type { SourceDriver } from "./source_driver.ts";
import {
  BoothDriver,
  CustomDomainDriver,
  GumroadDriver,
  ItchDriver,
  JinxxyDriver,
  SellfyDriver,
  ShopifyDriver
} from "./storefront_drivers.ts";
import { VpmDriver } from "./vpm_driver.ts";

/**
 * Maps every supported Version 0 platform identifier deterministically to its SourceDriver strategy.
 */
export class DriverRegistry {
  private readonly drivers = new Map<Platform, SourceDriver>();

  constructor(initialDrivers: readonly SourceDriver[]) {
    for (const driver of initialDrivers) {
      this.drivers.set(driver.platform, driver);
    }
  }

  public get(platform: Platform): SourceDriver | undefined {
    return this.drivers.get(platform);
  }

  public listPlatforms(): Platform[] {
    return [...this.drivers.keys()];
  }
}

export const vpmDriver = new VpmDriver();
export const githubDriver = new GitHubDriver();
export const boothDriver = new BoothDriver();
export const gumroadDriver = new GumroadDriver();
export const jinxxyDriver = new JinxxyDriver();
export const itchDriver = new ItchDriver();
export const shopifyDriver = new ShopifyDriver();
export const sellfyDriver = new SellfyDriver();
export const customDomainDriver = new CustomDomainDriver();

export const defaultDriverRegistry = new DriverRegistry([
  vpmDriver,
  githubDriver,
  boothDriver,
  gumroadDriver,
  jinxxyDriver,
  itchDriver,
  shopifyDriver,
  sellfyDriver,
  customDomainDriver
]);
