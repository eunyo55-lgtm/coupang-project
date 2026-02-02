import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '2rem', color: '#b91c1c', background: '#fef2f2', height: '100vh' }}>
                    <h1>오류가 발생했습니다 (Something went wrong)</h1>
                    <p>애플리케이션을 렌더링하는 중 문제가 발생했습니다.</p>
                    <br />
                    <details style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.05)', padding: '1rem', borderRadius: '4px' }}>
                        <summary>오류 상세 내용 (Error Details)</summary>
                        <br />
                        <strong>{this.state.error?.toString()}</strong>
                        <br />
                        <br />
                        {this.state.errorInfo?.componentStack}
                    </details>
                    <br />
                    <button
                        onClick={() => {
                            localStorage.removeItem('coupang_sales_data_v1');
                            window.location.reload();
                        }}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: '#b91c1c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        데이터 초기화 및 새로고침
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
