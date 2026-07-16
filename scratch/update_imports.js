const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');

const moduleMap = {
    'utils': 'shared/utils.js',
    'CloudflareResilience': 'browser/proxies/CloudflareResilience.js',
    'JobHelpers': 'shared/JobHelpers.js',
    'CircuitBreakers': 'shared/CircuitBreakers.js',
    'Observability': 'monitoring/Observability.js',
    'ATSRegistry': 'ats/detector/ATSRegistry.js',
    'AdapterRegistry': 'ats/detector/AdapterRegistry.js',
    'EngineLocation': 'extraction/parser/EngineLocation.js',
    'EngineExperience': 'extraction/parser/EngineExperience.js',
    'ArbitrationAI': 'extraction/ai/ArbitrationAI.js',
    'Deduplicator': 'deduplication/Deduplicator.js',
    'JobNormalizer': 'normalization/JobNormalizer.js',
    'Queues': 'orchestrator/Queues.js',
    'Storage': 'storage/Storage.js',
    'classifier': 'extraction/ai/classifier.js',
    'BaseAdapter': 'ats/adapters/BaseAdapter.js',
};

const adaptersDir = path.join(srcDir, 'ats/adapters');
if (fs.existsSync(adaptersDir)) {
    const adapters = fs.readdirSync(adaptersDir).filter(f => f.endsWith('Adapter.js') && f !== 'BaseAdapter.js');
    for (const adapter of adapters) {
        moduleMap[adapter.replace('.js', '')] = `ats/adapters/${adapter}`;
    }
}

function walkSync(dir, filelist) {
    const files = fs.readdirSync(dir);
    filelist = filelist || [];
    files.forEach(function(file) {
        if (fs.statSync(path.join(dir, file)).isDirectory()) {
            filelist = walkSync(path.join(dir, file), filelist);
        } else {
            if (file.endsWith('.js')) {
                filelist.push(path.join(dir, file));
            }
        }
    });
    return filelist;
}

const allJsFiles = walkSync(srcDir);

allJsFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf-8');
    let changed = false;

    content = content.replace(/require\(['"]([^'"]+)['"]\)/g, (match, reqPath) => {
        if (reqPath.startsWith('.')) {
            let moduleName = path.basename(reqPath, '.js');
            
            if (moduleMap[moduleName]) {
                const targetAbsolutePath = path.join(srcDir, moduleMap[moduleName]);
                const fileDir = path.dirname(file);
                let newRelPath = path.relative(fileDir, targetAbsolutePath);
                if (!newRelPath.startsWith('.')) {
                    newRelPath = './' + newRelPath;
                }
                if (newRelPath.endsWith('.js')) {
                    newRelPath = newRelPath.slice(0, -3);
                }
                changed = true;
                return `require('${newRelPath}')`;
            }
        }
        return match;
    });

    if (changed) {
        fs.writeFileSync(file, content, 'utf-8');
        console.log(`Updated ${path.relative(srcDir, file)}`);
    }
});
