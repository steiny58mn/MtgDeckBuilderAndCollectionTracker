import React, { useState } from 'react';
import { ConfirmModal } from './ConfirmModal';
import { Bookmark, Search, FolderPlus, Trash2, X } from 'lucide-react';
import { Binder } from '../types/mtg';

interface BinderListProps {
  binders: Binder[];
  onSelectBinder: (binder: Binder) => void;
  onCreateBinder: (name: string, description?: string) => void;
  onDeleteBinder: (binderId: string) => void;
}

export const BinderList: React.FC<BinderListProps> = ({
  binders,
  onSelectBinder,
  onCreateBinder,
  onDeleteBinder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBinderName, setNewBinderName] = useState('');
  const [newBinderDesc, setNewBinderDesc] = useState('');
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});

  const filteredBinders = binders.filter(
    (b) => !searchQuery.trim() || b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl backdrop-blur-sm">
        <div className="relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-500" />
          </div>
          <input
            type="text"
            placeholder="Search binders..."
            className="block w-full pl-9 pr-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all"
        >
          <FolderPlus className="w-4 h-4" />
          New Binder
        </button>
      </div>

      {filteredBinders.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredBinders.map((binder) => (
            <div
              key={binder.id}
              onClick={() => onSelectBinder(binder)}
              className="group p-5 bg-slate-900 border border-slate-800 hover:border-emerald-500/60 rounded-2xl shadow-xl transition-all duration-200 hover:-translate-y-1 cursor-pointer flex flex-col justify-between relative"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 shadow-inner">
                  <Bookmark className="w-6 h-6 text-emerald-500" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmState({
                      isOpen: true,
                      title: 'Delete Binder',
                      message: `Are you sure you want to delete the binder "${binder.name}"? Cards within the binder will remain in your collection.`,
                      onConfirm: () => onDeleteBinder(binder.id)
                    });
                  }}
                  className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:bg-rose-900/40 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete Binder"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100 group-hover:text-emerald-400 transition-colors line-clamp-1">{binder.name}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 min-h-[32px]">{binder.description || 'No description'}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 bg-slate-900/50 border border-slate-800 border-dashed rounded-2xl">
          <Bookmark className="w-12 h-12 text-slate-700 mb-4" />
          <h3 className="text-lg font-bold text-slate-400">No binders found</h3>
          <p className="text-sm text-slate-500 mt-1 text-center max-w-sm">
            {searchQuery ? "Try adjusting your search terms." : "Create your first binder to organize your collection!"}
          </p>
        </div>
      )}

      
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-emerald-400" />
                Create New Binder
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newBinderName.trim()) return;
                onCreateBinder(newBinderName.trim(), newBinderDesc.trim());
                setNewBinderName('');
                setNewBinderDesc('');
                setShowCreateModal(false);
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Binder Name</label>
                <input
                  type="text"
                  required
                  value={newBinderName}
                  onChange={(e) => setNewBinderName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                  placeholder="e.g., Rare Trades"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Description (Optional)</label>
                <textarea
                  value={newBinderDesc}
                  onChange={(e) => setNewBinderDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm min-h-[80px] resize-none"
                  placeholder="What goes in this binder?"
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newBinderName.trim()}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all"
                >
                  Create Binder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={() => {
          confirmState.onConfirm();
          setConfirmState(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
