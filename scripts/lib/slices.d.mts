/**
 * Types for the shared slice parser, so TypeScript tests can import the
 * same module the hooks use. The parser stays plain .mjs: hooks run under
 * bare node with no build step.
 */
export function sliceStatusBlock(claudeMd: string): string;
export function doneSlices(claudeMd: string): string[];
