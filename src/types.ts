export interface Node {
  name: string;
}

export interface Link {
  source: string;
  target: string;
  value: number;
}

export interface Snapshot {
  timestamp: string;
  nodes: Node[];
  links: Link[];
}

export interface FileInfo {
  name: string;
  size: number;
  type: string;
  lastModified: string;
  snapshots?: number;
  nodes?: number;
  links?: number;
} 