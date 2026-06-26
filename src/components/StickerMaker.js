'use client';

/**
 * CipherChat — Sticker Maker
 * Canvas-based drawing tool to create custom stickers
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const COLORS = [
  '#FFFFFF', '#000000', '#FF0000', '#FF6B00', '#FFD600',
  '#00E676', '#00B0FF', '#651FFF', '#FF4081', '#795548',
  '#00E5FF', '#76FF03', '#FFAB40', '#FF3D00', '#E040FB',
];

const BRUSH_SIZES = [2, 4, 8, 14, 24];

export default function StickerMaker({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#FFFFFF');
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState('brush'); // 'brush' | 'eraser' | 'text'
  const [textInput, setTextInput] = useState('');
  const [textSize, setTextSize] = useState(24);
  const lastPointRef = useRef(null);

  // Initialize canvas with transparent background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    // Draw checkerboard pattern to show transparency
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 256; x += 16) {
        ctx.fillStyle = ((x / 16 + y / 16) % 2 === 0) ? '#1a1a2e' : '#16213e';
        ctx.fillRect(x, y, 16, 16);
      }
    }
  }, []);

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDraw = useCallback((e) => {
    e.preventDefault();
    const pos = getPos(e);

    if (tool === 'text' && textInput.trim()) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.font = `bold ${textSize}px Inter, sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(textInput, pos.x, pos.y + textSize / 3);
      return;
    }

    setIsDrawing(true);
    lastPointRef.current = pos;

    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, (tool === 'eraser' ? brushSize * 2 : brushSize) / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === 'eraser' ? '#1a1a2e' : color;
    ctx.fill();
  }, [getPos, tool, color, brushSize, textInput, textSize]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    const last = lastPointRef.current;

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === 'eraser' ? '#1a1a2e' : color;
    ctx.lineWidth = tool === 'eraser' ? brushSize * 2 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastPointRef.current = pos;
  }, [isDrawing, getPos, tool, color, brushSize]);

  const stopDraw = useCallback(() => {
    setIsDrawing(false);
    lastPointRef.current = null;
  }, []);

  const clearCanvas = useCallback(() => {
    const ctx = canvasRef.current.getContext('2d');
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 256; x += 16) {
        ctx.fillStyle = ((x / 16 + y / 16) % 2 === 0) ? '#1a1a2e' : '#16213e';
        ctx.fillRect(x, y, 16, 16);
      }
    }
  }, []);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    const id = crypto.randomUUID();
    onSave?.(id, dataUrl);
  }, [onSave]);

  const handleImageUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current.getContext('2d');
        // Clear canvas first
        clearCanvas();
        // Scale image to fit 256x256
        const scale = Math.min(256 / img.width, 256 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (256 - w) / 2;
        const y = (256 - h) / 2;
        ctx.drawImage(img, x, y, w, h);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }, [clearCanvas]);

  return (
    <div className="sticker-maker-overlay">
      <div className="sticker-maker">
        <div className="sticker-maker-header">
          <h3>Create Sticker</h3>
          <button className="sticker-maker-close" onClick={onClose}>✕</button>
        </div>

        {/* Canvas */}
        <div className="sticker-canvas-wrapper">
          <canvas
            ref={canvasRef}
            className="sticker-canvas"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
        </div>

        {/* Tools */}
        <div className="sticker-tools">
          <div className="sticker-tool-group">
            <button
              className={`sticker-tool-btn ${tool === 'brush' ? 'active' : ''}`}
              onClick={() => setTool('brush')}
              title="Brush"
            >✏️</button>
            <button
              className={`sticker-tool-btn ${tool === 'eraser' ? 'active' : ''}`}
              onClick={() => setTool('eraser')}
              title="Eraser"
            >🧹</button>
            <button
              className={`sticker-tool-btn ${tool === 'text' ? 'active' : ''}`}
              onClick={() => setTool('text')}
              title="Text"
            >T</button>
          </div>

          {/* Colors */}
          <div className="sticker-colors">
            {COLORS.map(c => (
              <button
                key={c}
                className={`sticker-color ${color === c ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => { setColor(c); setTool('brush'); }}
              />
            ))}
          </div>

          {/* Brush sizes */}
          <div className="sticker-sizes">
            {BRUSH_SIZES.map(s => (
              <button
                key={s}
                className={`sticker-size-btn ${brushSize === s ? 'active' : ''}`}
                onClick={() => setBrushSize(s)}
              >
                <span className="sticker-size-dot" style={{ width: s + 4, height: s + 4 }} />
              </button>
            ))}
          </div>

          {/* Text input (when text tool active) */}
          {tool === 'text' && (
            <div className="sticker-text-input">
              <input
                type="text"
                placeholder="Type text..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                className="form-input"
                style={{ fontSize: '13px', padding: '6px 10px' }}
              />
              <select
                value={textSize}
                onChange={(e) => setTextSize(Number(e.target.value))}
                className="sticker-text-size"
              >
                <option value={16}>16px</option>
                <option value={24}>24px</option>
                <option value={36}>36px</option>
                <option value={48}>48px</option>
              </select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="sticker-actions">
          <label className="sticker-upload-btn">
            📷 Upload Image
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </label>
          <button className="sticker-clear-btn" onClick={clearCanvas}>🗑️ Clear</button>
          <button className="sticker-save-btn" onClick={handleSave}>💾 Save Sticker</button>
        </div>
      </div>
    </div>
  );
}
