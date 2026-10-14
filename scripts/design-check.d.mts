export declare const PAIRS: [string, string, number][];
export declare const RULES: { id: string; test: (line: string) => boolean; why: string }[];
export declare function readTokens(css?: string): Record<string, string>;
export declare function contrast(a: number[], b: number[]): number;
export declare function checkContrast(tokens?: Record<string, string>): string[];
export declare function checkSource(files?: string[]): string[];
export declare function runChecks(): string[];
