import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Database, Truck } from 'lucide-react';
import { parseExcel, parseProductMaster, parseInboundData } from '../utils/excelParser';

interface DataUploaderProps {
    onUploadSuccess: (data: any[]) => void;
    mode: 'sales' | 'master' | 'inbound';
    compact?: boolean;
}

export function DataUploader({ onUploadSuccess, mode, compact = false }: DataUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const processFile = async (file: File) => {
        setIsProcessing(true);
        setError(null);
        setSuccessMsg(null);

        const extension = file.name.split('.').pop()?.toLowerCase();
        if (extension !== 'xlsx' && extension !== 'xls' && extension !== 'csv') {
            setError('엑셀(.xlsx, .xls) 또는 CSV(.csv) 파일만 가능합니다.');
            setIsProcessing(false);
            return;
        }

        try {
            if (mode === 'sales') {
                const result = await parseExcel(file);
                if (result.errors.length > 0) {
                    setError(result.errors.join(', '));
                } else {
                    setSuccessMsg(`성공: ${result.records.length}건`);
                    onUploadSuccess(result.records);
                    setTimeout(() => setSuccessMsg(null), 3000);
                }
            } else if (mode === 'inbound') {
                const result = await parseInboundData(file);
                if (result.errors.length > 0) {
                    setError(result.errors.join(', '));
                } else {
                    setSuccessMsg(`성공: ${result.records.length}건`);
                    onUploadSuccess(result.records);
                    setTimeout(() => setSuccessMsg(null), 3000);
                }
            } else {
                const result = await parseProductMaster(file);
                if (result.errors.length > 0) {
                    setError(result.errors.join(', '));
                } else {
                    setSuccessMsg(`성공: ${result.products.length}건`);
                    onUploadSuccess(result.products);
                    setTimeout(() => setSuccessMsg(null), 3000);
                }
            }
        } catch (err) {
            console.error(err);
            setError('파일 처리 오류. 콘솔을 확인하세요.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) {
            await processFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await processFile(e.target.files[0]);
        }
    };

    if (compact) {
        return (
            <div
                className={`card ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById(`fileInput-${mode}`)?.click()}
                style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    border: isDragging ? '2px dashed var(--primary)' : '1px solid #e2e8f0',
                    background: isDragging ? 'rgba(79, 70, 229, 0.05)' : 'white',
                    transition: 'all 0.2s',
                    minWidth: '200px'
                }}
            >
                <input type="file" id={`fileInput-${mode}`} style={{ display: 'none' }} accept=".xlsx, .xls, .csv" onChange={handleFileChange} />

                <div style={{
                    width: '32px', height: '32px',
                    background: mode === 'sales' ? '#dcfce7' : '#e0e7ff',
                    borderRadius: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                }}>
                    {mode === 'sales' ? <FileSpreadsheet size={18} color="#166534" /> : mode === 'inbound' ? <Truck size={18} color="#b45309" /> : <Database size={18} color="#4338ca" />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {mode === 'sales' ? '판매 데이터 업로드' : mode === 'inbound' ? '입고 예정 파일' : '상품 목록 등록'}
                    </div>
                    {isProcessing ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>처리중...</div>
                    ) : successMsg ? (
                        <div style={{ fontSize: '0.75rem', color: '#15803d' }}>{successMsg}</div>
                    ) : error ? (
                        <div title={error} style={{ fontSize: '0.75rem', color: '#b91c1c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {error}
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>클릭 또는 드래그</div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="card">
            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {mode === 'sales' ? <FileSpreadsheet size={24} color="var(--success)" /> : mode === 'inbound' ? <Truck size={24} color="#d97706" /> : <Database size={24} color="var(--primary)" />}
                {mode === 'sales' ? '판매 데이터 업로드' : mode === 'inbound' ? '입고 예정 파일 등록' : '상품 목록 등록'}
            </h3>

            <div
                className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    border: isDragging ? '2px dashed var(--primary)' : '2px dashed #cbd5e1',
                    borderRadius: 'var(--radius-md)',
                    padding: '2rem',
                    textAlign: 'center',
                    background: isDragging ? 'rgba(79, 70, 229, 0.05)' : 'transparent',
                    cursor: 'pointer'
                }}
                onClick={() => document.getElementById(`fileInput-${mode}-large`)?.click()}
            >
                <input type="file" id={`fileInput-${mode}-large`} style={{ display: 'none' }} accept=".xlsx, .xls, .csv" onChange={handleFileChange} />
                <Upload size={24} color="var(--text-secondary)" style={{ marginBottom: '0.5rem' }} />
            </div>

            {error && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#b91c1c', background: '#fee2e2', padding: '0.5rem', borderRadius: '4px' }}>
                    <AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                    {error}
                </div>
            )}
            {successMsg && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#15803d' }}>
                    <CheckCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                    {successMsg}
                </div>
            )}
        </div>
    );
}
