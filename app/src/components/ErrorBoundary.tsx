import React from 'react';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; inline?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('UI error:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="panel" style={{ margin: this.props.inline ? '1em 0' : '40px auto', maxWidth: 720, borderColor: 'var(--red)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--red)' }}>Something went wrong here</h3>
          <p className="dim">This part of the app hit an error. Your progress is saved. Try going back to the map.</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{String(this.state.error?.message ?? this.state.error)}</pre>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
