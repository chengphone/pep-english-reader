import { ArrowLeft, Headphones } from 'lucide-react'
export default function ReaderHeader({title,source,onBack,onDictation}:{title:string;source:string;onBack:()=>void;onDictation:()=>void}) {
 return <header className="reader-head"><div className="reader-head-inner"><button className="back-link" onClick={onBack}><ArrowLeft size={15}/>返回书架</button><div className="reader-title"><h1>{title}</h1><span>{source}</span></div><div className="reader-tools"><button className="tool-pill" onClick={onDictation}><Headphones size={15}/>听写练习</button></div></div></header>
}
