const fs = require('fs');
const path = require('path');

const fileName = process.argv[2];

if (!fileName) {
  console.log('LLM Avalon Performance Statistics Utility');
  console.log('Usage: node tools/calculate-log-stats.js <path-to-log-file.json>');
  process.exit(1);
}

const filePath = path.isAbsolute(fileName) ? fileName : path.join(process.cwd(), fileName);

try {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);

  let totalPromptSpeed = 0;
  let totalCompletionSpeed = 0;
  let promptCount = 0;
  let completionCount = 0;

  const games = Array.isArray(data) ? data : [data];

  games.forEach(game => {
    if (game.events && Array.isArray(game.events)) {
      game.events.forEach(event => {
        if (event.promptSpeed !== undefined && event.promptSpeed !== null) {
          totalPromptSpeed += event.promptSpeed;
          promptCount++;
        }
        if (event.completionSpeed !== undefined && event.completionSpeed !== null) {
          totalCompletionSpeed += event.completionSpeed;
          completionCount++;
        }
      });
    }
  });

  if (promptCount === 0 && completionCount === 0) {
    console.log('Model Performance: PP: ~-, OUT: ~-');
    console.log('(No performance metrics found in this log. This is typical for Hosted APIs.)');
  } else {
    const avgPrompt = promptCount > 0 ? (totalPromptSpeed / promptCount).toFixed(0) : '-';
    const avgCompletion = completionCount > 0 ? (totalCompletionSpeed / completionCount).toFixed(1) : '-';

    console.log(`Model Performance: PP: ~${avgPrompt} t/s, OUT: ~${avgCompletion} t/s`);
  }
} catch (error) {
  console.error('Error processing the file:', error.message);
}
