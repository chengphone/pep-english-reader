export type ReaderItem={id:string;text:string;translation?:string;order:number;rects:[number,number,number,number][];audio?:string}
export type ReaderPage={hotspotVersion?:number;page:number;printedPage?:number;image:string;items:ReaderItem[]}
export type ReaderManifest={schemaVersion:number;bookId:string;title:string;publisherId:string;grade?:number;term?:string;pages:ReaderPage[]}
export type LocalBook={id:string;manifest:ReaderManifest;assets:Record<string,Blob>;lastPage?:number}
export type OnlineBook={id:string;grade:number;term:'a'|'b';edition?:string}
