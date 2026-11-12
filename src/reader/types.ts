// audioStart / audioEnd 是可选播放区间（秒）：audioEnd 大于 audioStart 时点读只播这一小段；
// 任一字段缺失或终点不大于起点时播放整段音频，兼容未设置区间的老清单。
export type ReaderItem={id:string;text:string;translation?:string;order:number;rects:[number,number,number,number][];audio?:string;audioStart?:number;audioEnd?:number}
// 页面级课堂资源：整页音频或课堂动漫，按页挂在清单的 resources 上。
// continuous 表示同一段音频会在相邻页重复出现，翻页时保持播放；
// startAt 是该页在这段音频里的起点（秒），只在从本页重新播放时生效。
export type ReaderResource={id:string;kind:'audio'|'video';title:string;subtitle?:string;src:string;track?:number;duration?:number;poster?:string;continuous?:boolean;startAt?:number}
export type ReaderPage={hotspotVersion?:number;page:number;printedPage?:number;image:string;items:ReaderItem[];resources?:ReaderResource[]}
// 书籍目录条目：page 是清单 pages 里的物理页码（1 起），不是书上的印刷页码。
// 没有显式 toc 时，阅读器会从 _t/_h 标题条目或课堂资源里的 Lesson 编号自动生成目录。
export type ReaderTocEntry={title:string;page:number;level?:number;subtitle?:string;group?:string}
// 目录主题分组：按物理页码区间给条目归组，供图画词典这类大目录使用。
export type ReaderTocGroup={title:string;from:number;to:number}
export type ReaderManifest={schemaVersion:number;bookId:string;title:string;publisherId:string;grade?:number;term?:string;series?:string;publisher?:string;toc?:ReaderTocEntry[];tocGroups?:ReaderTocGroup[];pages:ReaderPage[]}
// remote 为 true 时 assets 为空，清单里的 image / audio 已是可直接访问的 URL，
// 阅读器按远程资源播放，不写入 IndexedDB。
export type LocalBook={id:string;manifest:ReaderManifest;assets:Record<string,Blob>;lastPage?:number;remote?:boolean;manifestUrl?:string}
export type OnlineBook={id:string;grade:number;term:'a'|'b';edition?:string}
export type RemoteBookEntry={id:string;title:string;manifest:string;pages?:number;items?:number;audio?:number;videos?:number;cover?:string;series?:string;publisher?:string}
