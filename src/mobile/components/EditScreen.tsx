import { parseHexColor } from '@core/color';
import { useApp } from '@renderer/store/appStore';
import { useSelected } from '@renderer/store/selectors';
import { Thumbnail } from '@renderer/components/Thumbnail';
import { CompareIcon, EraserIcon, FillIcon, GridIcon, PencilIcon, PickerIcon, RedoIcon, UndoIcon } from '@renderer/components/Icons';
import { rgbaHex } from '@renderer/util';
import { useMobileUi, type MobileTool } from '../state';
import { MobileCanvas } from './MobileCanvas';
import { MoveIcon } from './icons';

const TOOLS: { id: MobileTool; label: string; Icon: typeof PencilIcon }[] = [
  { id: 'move', label: 'Move & zoom (pinch with two fingers in any tool)', Icon: MoveIcon },
  { id: 'pencil', label: 'Pencil', Icon: PencilIcon },
  { id: 'eraser', label: 'Eraser (makes pixels transparent)', Icon: EraserIcon },
  { id: 'picker', label: 'Color picker', Icon: PickerIcon },
  { id: 'fill', label: 'Fill (contiguous, exact color)', Icon: FillIcon },
];

function ToolBar() {
  const tool = useMobileUi((s) => s.tool);
  const setTool = useMobileUi((s) => s.setTool);
  const editor = useApp((s) => s.editor);
  const setEditor = useApp((s) => s.setEditor);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const docs = useApp((s) => s.docs);
  const selected = useSelected();
  const hist = selected ? docs[selected.variation.id] : undefined;
  return (
    <div className="m-toolbar" role="toolbar" aria-label="Editing tools">
      <div className="m-tool-row">
        {TOOLS.map(({ id, label, Icon }) => (
          <button key={id} className={`icon-btn ${tool === id ? 'active' : ''}`} aria-pressed={tool === id} aria-label={label} title={label} onClick={() => setTool(id)}>
            <Icon />
          </button>
        ))}
        <span className="m-sep" />
        <button className="icon-btn" aria-label="Undo" disabled={!hist?.undo.length} onClick={undo}>
          <UndoIcon />
        </button>
        <button className="icon-btn" aria-label="Redo" disabled={!hist?.redo.length} onClick={redo}>
          <RedoIcon />
        </button>
      </div>
      <div className="m-tool-row">
        <input
          type="color"
          aria-label="Drawing color"
          value={rgbaHex(editor.color).slice(0, 7)}
          onChange={(e) => {
            const c = parseHexColor(e.target.value);
            if (c) setEditor({ color: [c[0], c[1], c[2], editor.color[3] || 255] });
          }}
        />
        <label className="m-alpha">
          α
          <input
            type="range"
            min={0}
            max={255}
            value={editor.color[3]}
            aria-label="Drawing alpha"
            onChange={(e) => setEditor({ color: [editor.color[0], editor.color[1], editor.color[2], Number(e.target.value)] })}
          />
        </label>
        <button
          className="swatch transparent"
          aria-label="Draw transparent pixels"
          onClick={() => {
            setEditor({ color: [editor.color[0], editor.color[1], editor.color[2], 0] });
            setTool('pencil');
          }}
        />
        <span className="m-sep" />
        <button className={`icon-btn ${editor.showGrid ? 'active' : ''}`} aria-pressed={editor.showGrid} aria-label="Pixel grid" onClick={() => setEditor({ showGrid: !editor.showGrid })}>
          <GridIcon />
        </button>
        <button className={`icon-btn ${editor.compare ? 'active' : ''}`} aria-pressed={editor.compare} aria-label="Before/after compare" onClick={() => setEditor({ compare: !editor.compare })}>
          <CompareIcon />
        </button>
      </div>
    </div>
  );
}

export function EditScreen() {
  const selected = useSelected();
  const select = useApp((s) => s.select);
  const openDialog = useApp((s) => s.openDialog);
  const reset = useApp((s) => s.resetToOriginal);
  const openSheet = useMobileUi((s) => s.openSheet);
  const setTab = useMobileUi((s) => s.setTab);

  if (!selected) {
    return (
      <div className="m-empty">
        <h2>No sprite selected</h2>
        <p>Generate a sprite on the Create tab, or open one from the Library.</p>
        <button className="btn primary" onClick={() => setTab('create')}>
          Go to Create
        </button>
      </div>
    );
  }
  const { record, variation } = selected;
  const active = variation.pipeline.filter((s) => s.enabled).length;
  return (
    <div className="m-edit">
      {record.variations.length > 1 && (
        <ul className="m-variations" aria-label="Variations">
          {record.variations.map((v) => (
            <li key={v.id}>
              <button className={v.id === variation.id ? 'active' : ''} aria-pressed={v.id === variation.id} onClick={() => select(record.id, v.id)} aria-label={`Variation ${v.index + 1}`}>
                <Thumbnail image={v.current} display={44} label={`Variation ${v.index + 1}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <MobileCanvas />
      <ToolBar />
      <div className="m-actions">
        <button className="btn" onClick={() => openSheet('filters')}>
          Filters{active ? ` (${active})` : ''}
        </button>
        <button className="btn" onClick={() => openSheet('info')}>
          Info
        </button>
        <button className="btn primary" onClick={() => openDialog({ kind: 'export', mode: 'sprite' })}>
          Export
        </button>
        <button className="btn" onClick={reset} aria-label="Reset to the original generation">
          Reset
        </button>
      </div>
    </div>
  );
}
