// audioStart / audioEnd 是可选播放区间（秒）：audioEnd 大于 audioStart 时点读只播这一小段；
// 任一字段缺失或终点不大于起点时播放整段音频，兼容未设置区间的老清单。
export type ReaderItem={id:string;text:string;translation?:string;order:number;rects:[number,number,number,number][];audio?:string;audioStart?:number;audioEnd?:number}
export type ReaderPage={hotspotVersion?:number;page:number;printedPage?:number;image:string;items:ReaderItem[]}
export type ReaderManifest={schemaVersion:number;bookId:string;title:string;publisherId:string;grade?:number;term?:string;pages:ReaderPage[]}
// remote 为 true 时 assets 为空，清单里的 image / audio 已是可直接访问的 URL，
// 阅读器按远程资源播放，不写入 IndexedDB。
export type LocalBook={id:string;manifest:ReaderManifest;assets:Record<string,Blob>;lastPage?:number;remote?:boolean}
export type OnlineBook={id:string;grade:number;term:'a'|'b';edition?:string}
export type RemoteBookEntry={id:string;title:string;manifest:string;pages?:number;cover?:string}
