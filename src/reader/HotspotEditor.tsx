import { Download, Save, Trash2, X } from 'lucide-react'
import type { ReaderItem, ReaderResource } from './types'

type Props = {
  pageNumber: number
  items: ReaderItem[]
  selectedId?: string
  audioResources: ReaderResource[]
  saving: boolean
  onSelect: (item: ReaderItem) => void
  onChange: (patch: Partial<ReaderItem>) => void
  onDelete: () => void
  onSave: () => void
  onCancel: () => void
  onExportPage: () => void
  onExportAll: () => void
}

// 内容管理：在书页上拖拽画出矩形，再填写词条和音频区间。
// 保存后写入本机教材或浏览器覆盖层；导出的 JSON 可放回仓库外的点读数据文件。
export default function HotspotEditor({ pageNumber, items, selectedId, audioResources, saving, onSelect, onChange, onDelete, onSave, onCancel, onExportPage, onExportAll }: Props) {
  const selected = items.find(item => item.id === selectedId)
  const sorted = [...items].sort((left, right) => left.order - right.order)
  return <aside className="hotspot-editor" aria-label="点读热区标注">
    <header className="hotspot-editor-head">
      <div><span className="page-resources-kicker">内容管理</span><h2>第 {pageNumber} 页热区</h2></div>
      <button aria-label="关闭标注" title="关闭" onClick={onCancel}><X size={17}/></button>
    </header>
    <p className="hotspot-editor-hint">在书页上按住拖动，画出一个新的点读区域。</p>
    <div className="hotspot-editor-list">
      {!sorted.length && <p className="hotspot-editor-empty">本页还没有热区。先在书页上画一个矩形。</p>}
      {sorted.map(item => <button key={item.id} className={item.id === selectedId ? 'is-active' : ''} onClick={() => onSelect(item)}>
        <span>{item.text || '未命名词条'}</span>
        <small>{item.rects.length} 个区域 · {item.audioStart != null ? `${item.audioStart.toFixed(2)}–${(item.audioEnd ?? 0).toFixed(2)}s` : '整段音频'}</small>
      </button>)}
    </div>
    {selected ? <div className="hotspot-editor-form">
      <label>单词 / 句子<input value={selected.text} onChange={event => onChange({ text: event.target.value })} placeholder="例如 apple"/></label>
      <label>中文释义<input value={selected.translation ?? ''} onChange={event => onChange({ translation: event.target.value })} placeholder="例如 苹果"/></label>
      <label>音频<select value={selected.audio ?? ''} onChange={event => onChange({ audio: event.target.value || undefined })}>
        <option value="">不绑定音频</option>
        {audioResources.map(resource => <option key={resource.id} value={resource.src}>{resource.title} · {resource.subtitle || resource.src.split('/').pop()}</option>)}
      </select></label>
      <div className="hotspot-editor-range">
        <label>开始<input type="number" min={0} step={0.01} value={selected.audioStart ?? 0} onChange={event => onChange({ audioStart: Number(event.target.value) })}/></label>
        <label>结束<input type="number" min={0} step={0.01} value={selected.audioEnd ?? 0} onChange={event => onChange({ audioEnd: Number(event.target.value) })}/></label>
      </div>
      <small className="hotspot-editor-meta">{selected.rects.length} 个热区 · 音频区间必须从真实音轨核对</small>
      <div className="hotspot-editor-actions">
        <button className="is-danger" onClick={onDelete}><Trash2 size={15}/>删除</button>
        <button onClick={onExportPage}><Download size={15}/>导出本页</button>
      </div>
    </div> : <p className="hotspot-editor-empty">选中一个热区后，可以修改词条和音频区间。</p>}
    <footer className="hotspot-editor-footer">
      <button onClick={onCancel} disabled={saving}>取消</button>
      <button className="is-primary" onClick={onSave} disabled={saving}>{saving ? '保存中…' : '保存热区'}<Save size={15}/></button>
    </footer>
    <button className="hotspot-editor-export-all" onClick={onExportAll}><Download size={14}/>导出全书热区 JSON</button>
  </aside>
}
