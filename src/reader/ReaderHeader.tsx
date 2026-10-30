import { ArrowLeft, BookOpen, Headphones } from 'lucide-react'
export default function ReaderHeader({title,source,onBack,onDictation}:{title:string;source:string;onBack:()=>void;onDictation:()=>void}) {
 return <header className="reading-header"><div className="reading-brand"><BookOpen size={31}/><span>英语课本点读</span></div><div className="reading-book-title"><h1>{title}</h1><p>{source}</p></div><nav aria-label="阅读导航"><button onClick={onBack}><ArrowLeft size={17}/><span>返回书架</span></button><button onClick={onDictation}><Headphones size={17}/><span>听写练习</span></button></nav></header>
}
