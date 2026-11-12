import { useEffect, useState } from 'react'
import { Lock, ShieldCheck, X } from 'lucide-react'
import { hasTeacherPin, setTeacherMode, setTeacherPin, verifyTeacherPin } from './adminMode'

type Props = {
  onClose: () => void
}

// 教师管理模式：第一次设置 4 位本机密码，之后凭密码解锁热区标注和释义编辑。
// 这是儿童端的误操作保护，不是账号权限；密码哈希只存在本机 localStorage。
export default function TeacherModeDialog({ onClose }: Props) {
  const [setup] = useState(() => !hasTeacherPin())
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [onClose])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!/^\d{4}$/.test(pin)) {
      setError('请输入 4 位数字密码。')
      return
    }
    if (setup) {
      if (pin !== confirm) {
        setError('两次输入的密码不一致。')
        return
      }
      setTeacherPin(pin)
      setTeacherMode(true)
      onClose()
      return
    }
    if (!verifyTeacherPin(pin)) {
      setError('密码不正确，请重试。')
      setPin('')
      return
    }
    setTeacherMode(true)
    onClose()
  }

  function digits(value: string) {
    return value.replace(/\D/g, '').slice(0, 4)
  }

  return <div className="learning-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="teacher-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="teacher-admin-title">
      <header className="learning-dialog-head">
        <div>
          <span className="page-resources-kicker">教师管理</span>
          <h2 id="teacher-admin-title">{setup ? '设置管理密码' : '进入管理模式'}</h2>
        </div>
        <button type="button" aria-label="关闭教师管理" title="关闭" onClick={onClose}><X size={19}/></button>
      </header>
      <form className="teacher-admin-form" onSubmit={submit}>
        <div className={`teacher-admin-note${setup ? ' is-setup' : ''}`}>
          {setup ? <ShieldCheck size={20}/> : <Lock size={20}/>}
          <p>{setup
            ? '设置一个 4 位数字密码。以后只有输入密码，才会显示热区标注和释义编辑。'
            : '输入管理密码后，阅读工具里才会出现热区标注和释义编辑。'}</p>
        </div>
        <label>
          <span>{setup ? '设置密码' : '管理密码'}</span>
          <input
            value={pin}
            onChange={event => setPin(digits(event.target.value))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="4 位数字"
            aria-label={setup ? '设置管理密码' : '管理密码'}
            autoFocus
          />
        </label>
        {setup && <label>
          <span>再输一次</span>
          <input
            value={confirm}
            onChange={event => setConfirm(digits(event.target.value))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="确认密码"
            aria-label="确认管理密码"
          />
        </label>}
        {error && <p className="teacher-admin-error" role="alert">{error}</p>}
        <p className="teacher-admin-hint">密码只保存在本机浏览器；忘记密码时，清除本站点数据后可重新设置。</p>
        <div className="teacher-admin-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="submit" className="is-primary" disabled={pin.length !== 4 || (setup && confirm.length !== 4)}>
            {setup ? '设置并进入' : '解锁管理模式'}
          </button>
        </div>
      </form>
    </section>
  </div>
}
