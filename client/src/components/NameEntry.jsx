import { useState } from 'react';

export function NameEntry({ onSubmit }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入昵称');
      return;
    }
    if (name.trim().length > 12) {
      setError('昵称不能超过12个字符');
      return;
    }
    onSubmit(name.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 game-backdrop">
      <div className="w-full max-w-md animate-fade-in reveal-item" style={{ '--reveal-delay': '80ms' }}>
        <div className="text-center mb-8">
          <h1 className="font-game text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-snow-ice to-blue-300 mb-2">
            SnowTime
          </h1>
          <p className="text-white/60 text-lg">冰雪奇缘桌游</p>
        </div>

        <div className="panel-frost rounded-2xl p-8 shadow-2xl">
          <h2 className="text-2xl font-semibold text-center mb-6">开始游戏</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                输入你的昵称
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder="例如：冰雪勇士"
                className="w-full"
                autoFocus
              />
              {error && (
                <p className="text-red-400 text-sm mt-2">{error}</p>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary w-full text-lg"
              disabled={!name.trim()}
            >
              继续
            </button>
          </form>
        </div>

        <div className="text-center mt-6 text-white/40 text-sm">
          <p>支持 3-5 名玩家联机对战</p>
        </div>
      </div>
    </div>
  );
}
