/**
 * 游戏结束界面
 * 显示获胜者和最终排名
 */
export function GameOver({ winner, players, onReturn }) {
  // 按分数排序（位置最高、战斗分、果实分、法力分）
  const sortedPlayers = [...players].sort((a, b) => {
    if (b.position !== a.position) return b.position - a.position;
    if (b.fightPoints !== a.fightPoints) return b.fightPoints - a.fightPoints;
    if (b.fruitPoints !== a.fruitPoints) return b.fruitPoints - a.fruitPoints;
    return b.manaPoints - a.manaPoints;
  });

  const getRankIcon = (index) => {
    switch (index) {
      case 0: return '🥇';
      case 1: return '🥈';
      case 2: return '🥉';
      default: return `${index + 1}.`;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-snow-dark via-snow-blue to-[#0f0f23]">
      <div className="w-full max-w-lg animate-fade-in">
        {/* 胜利标题 */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">❄️</div>
          <h1 className="font-game text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-snow-gold to-yellow-300 mb-2">
            游戏结束
          </h1>
          {winner ? (
            <div className="mt-4">
              <p className="text-white/60 mb-2">获胜者</p>
              <div
                className="inline-block px-6 py-3 rounded-xl text-xl font-bold"
                style={{
                  backgroundColor: `${winner.color}33`,
                  borderColor: winner.color,
                  borderWidth: '2px',
                  color: winner.color
                }}
              >
                🏆 {winner.name}
              </div>
            </div>
          ) : (
            <p className="text-white/60 mt-4">平局！</p>
          )}
        </div>

        {/* 排名列表 */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-2xl">
          <h2 className="text-xl font-semibold mb-4 text-center text-snow-ice">最终排名</h2>

          <div className="space-y-3">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-4 rounded-xl ${
                  index === 0
                    ? 'bg-gradient-to-r from-yellow-500/20 to-transparent border border-yellow-500/50'
                    : 'bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getRankIcon(index)}</span>
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: player.color }}
                  />
                  <div>
                    <p className="font-semibold">{player.name}</p>
                    <p className="text-xs text-white/50">
                      位置: {player.position}
                      {player.fightPoints > 0 && ` · 战斗: ${player.fightPoints}`}
                      {player.fruitPoints > 0 && ` · 果实: ${player.fruitPoints}`}
                      {player.manaPoints > 0 && ` · 法力: ${player.manaPoints}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-snow-gold">{player.position}</p>
                  <p className="text-xs text-white/40">格</p>
                </div>
              </div>
            ))}
          </div>

          {/* 返回按钮 */}
          <button
            onClick={onReturn}
            className="btn-primary w-full mt-6"
          >
            返回大厅
          </button>
        </div>

        <p className="text-center mt-6 text-white/40 text-sm">
          感谢游玩 SnowTime！
        </p>
      </div>
    </div>
  );
}
