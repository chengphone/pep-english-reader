import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; resetKey: string }
type State = { failed: boolean }

// 懒加载路由的 chunk 可能因为断网、部署后旧哈希失效或代理拦截而加载失败。
// React.lazy 会缓存这次失败，单靠重新渲染无法恢复，所以给用户一个明确的重载入口。
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Route chunk failed to load', error, info.componentStack)
  }

  componentDidUpdate(previous: Props) {
    // 切到别的路由时清掉错误，让其他页面仍可继续使用。
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <div className="route-error" role="alert">
      <div className="route-error-card">
        <strong>页面加载失败</strong>
        <p>可能是网络中断，或者应用刚更新导致旧资源已失效。重新加载即可恢复。</p>
        <button type="button" className="route-error-action" onClick={() => window.location.reload()}>重新加载</button>
      </div>
    </div>
  }
}
