import React from 'react';
import { 
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, 
  Quote, Code, Terminal, List, ListOrdered, CheckSquare, 
  Table, Link, Minus, Copy, Download, Columns2, Square, Eye, Trash2, History
} from 'lucide-react';

function Toolbar({ 
  onFormat, 
  viewMode, 
  setViewMode, 
  onCopyMarkdown, 
  onDownloadMarkdown, 
  onClearDoc,
  onOpenHistory,
  copied 
}) {
  return (
    <div className="editor-toolbar">
      {/* Inline formatting */}
      <div className="toolbar-group">
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('**', '**', 'bold text')} 
          title="Bold"
        >
          <Bold size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('*', '*', 'italic text')} 
          title="Italic"
        >
          <Italic size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('~~', '~~', 'strikethrough')} 
          title="Strikethrough"
        >
          <Strikethrough size={15} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Headings */}
      <div className="toolbar-group">
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('# ', '', 'Heading 1')} 
          title="Heading 1"
        >
          <Heading1 size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('## ', '', 'Heading 2')} 
          title="Heading 2"
        >
          <Heading2 size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('### ', '', 'Heading 3')} 
          title="Heading 3"
        >
          <Heading3 size={15} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Code & Quote */}
      <div className="toolbar-group">
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('`', '`', 'code')} 
          title="Inline Code"
        >
          <Code size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('```javascript\n', '\n```', '// code')} 
          title="Code Block"
        >
          <Terminal size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('> ', '', 'Quote text')} 
          title="Quote"
        >
          <Quote size={15} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Lists, Table, Link */}
      <div className="toolbar-group">
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('- ', '', 'List item')} 
          title="Bullet List"
        >
          <List size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('1. ', '', 'Numbered item')} 
          title="Numbered List"
        >
          <ListOrdered size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('- [ ] ', '', 'Task item')} 
          title="Task List"
        >
          <CheckSquare size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('| Col 1 | Col 2 |\n| ----- | ----- |\n| Val 1 | Val 2 |\n', '', '')} 
          title="Table"
        >
          <Table size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('[', '](https://example.com)', 'link text')} 
          title="Link"
        >
          <Link size={15} />
        </button>
        <button 
          type="button"
          className="toolbar-btn" 
          onClick={() => onFormat('---\n', '', '')} 
          title="Horizontal Rule"
        >
          <Minus size={15} />
        </button>
      </div>

      {/* Right side: View toggles & Document actions */}
      <div className="toolbar-right">
        {/* Layout Modes */}
        <div className="view-mode-toggle">
          <button 
            type="button"
            className={`mode-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
            title="Split View"
          >
            <Columns2 size={14} />
            <span>Split</span>
          </button>
          <button 
            type="button"
            className={`mode-btn ${viewMode === 'editor' ? 'active' : ''}`}
            onClick={() => setViewMode('editor')}
            title="Editor Only"
          >
            <Square size={14} />
            <span>Editor</span>
          </button>
          <button 
            type="button"
            className={`mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
            onClick={() => setViewMode('preview')}
            title="Preview Only"
          >
            <Eye size={14} />
            <span>Preview</span>
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Action Buttons */}
        <div className="toolbar-group">
          <button 
            type="button"
            className="toolbar-action-btn history-btn" 
            onClick={onOpenHistory}
            title="Version Control & Snapshots (Module 5)"
          >
            <History size={14} />
            <span>History</span>
          </button>
          <button 
            type="button"
            className={`toolbar-action-btn ${copied ? 'copied' : ''}`} 
            onClick={onCopyMarkdown}
            title="Copy Markdown to clipboard"
          >
            <Copy size={14} />
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button 
            type="button"
            className="toolbar-action-btn" 
            onClick={onDownloadMarkdown}
            title="Download .md file"
          >
            <Download size={14} />
            <span>Export</span>
          </button>
          <button 
            type="button"
            className="toolbar-action-btn danger" 
            onClick={onClearDoc}
            title="Clear editor document"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Toolbar;
