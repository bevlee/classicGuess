export interface Track {
  id: string;
  workId: string;
  composer: string;
  work: string;
  movement?: string;
  aliases: string[];
  audioUrl: string;
  /** Timestamp in the original recording; generated game assets start at zero. */
  cueStart: number;
  excerptDuration: number;
  source: { name: string; url: string; performer?: string; license: 'cc0' | 'public-domain' | 'unrestricted-permission'; licenseUrl?: string; permission?: string };
}
