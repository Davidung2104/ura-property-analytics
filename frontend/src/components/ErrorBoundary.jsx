import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error: error.message || 'Unknown error' };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
    this.setState({ info: info?.componentStack || '' });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: '#f8fafc', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 500, padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>{this.state.error}</p>
            {this.state.info && (
              <details style={{ textAlign: 'left', marginBottom: 20 }}>
                <summary style={{ fontSize: 11, color: '#94a3b8', cursor: 'pointer', marginBottom: 8 }}>Technical details</summary>
                <pre style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap' }}>{this.state.info}</pre>
              </details>
            )}
            <button
              onClick={() => { this.setState({ error: null, info: null }); }}
              style={{ background: '#38bdf8', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}
            >Try Again</button>
            <button
              onClick={() => window.location.reload()}
              style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >Reload Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export class SectionBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error: error.message };
  }
  componentDidCatch(error) {
    console.error(`Section "${this.props.name}" crashed:`, error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>⚠️ {this.props.name || 'Section'} failed to render</div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>{this.state.error}</div>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 8, background: '#fff', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: '#ef4444', cursor: 'pointer' }}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
