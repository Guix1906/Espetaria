import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GITHUB_REPO = 'Guix1906/Espetaria';
const COMMITS_API = `https://api.github.com/repos/${GITHUB_REPO}/commits?path=printer-bridge&per_page=1`;
const CONTENTS_API = `https://api.github.com/repos/${GITHUB_REPO}/contents/printer-bridge/src`;
const VERSION_FILE = path.join(__dirname, 'version.json');
const SRC_DIR = path.join(__dirname, 'src');

const log = (...args) => console.log(new Date().toLocaleTimeString('pt-BR'), '[updater]', ...args);

/** Lê o hash do commit local salvo. */
async function getLocalSha() {
  try {
    const raw = await fs.readFile(VERSION_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data.sha || null;
  } catch {
    return null;
  }
}

/** Salva o hash do commit aplicado. */
async function saveLocalSha(sha) {
  try {
    await fs.writeFile(VERSION_FILE, JSON.stringify({ sha, updated_at: new Date().toISOString() }, null, 2), 'utf8');
  } catch (err) {
    log('Aviso: não foi possível salvar version.json:', err.message);
  }
}

/**
 * Verifica no GitHub se há um commit mais recente em printer-bridge.
 * Se houver, baixa apenas os arquivos de src/ e atualiza o version.json.
 * Retorna true se atualizou, false se já está na versão mais recente.
 */
export async function checkForUpdates() {
  try {
    // 1. Consulta o último commit que tocou na pasta printer-bridge
    const res = await fetch(COMMITS_API, {
      headers: { 'User-Agent': 'Espetaria-Printer-Updater' },
    });
    if (!res.ok) {
      log(`Não foi possível checar atualizações no GitHub (HTTP ${res.status}).`);
      return false;
    }

    const commits = await res.json();
    if (!Array.isArray(commits) || !commits.length || !commits[0].sha) {
      return false;
    }

    const remoteSha = commits[0].sha;
    const localSha = await getLocalSha();

    if (localSha && localSha === remoteSha) {
      // Já está atualizado
      return false;
    }

    log(`Nova versão detectada no GitHub (${remoteSha.slice(0, 7)}). Atualizando arquivos...`);

    // 2. Lista os arquivos atuais de printer-bridge/src no GitHub
    const contentsRes = await fetch(CONTENTS_API, {
      headers: { 'User-Agent': 'Espetaria-Printer-Updater' },
    });
    if (!contentsRes.ok) {
      log(`Falha ao listar arquivos no GitHub (HTTP ${contentsRes.status}).`);
      return false;
    }

    const items = await contentsRes.json();
    if (!Array.isArray(items)) return false;

    await fs.mkdir(SRC_DIR, { recursive: true });

    let updatedCount = 0;
    for (const item of items) {
      // Apenas arquivos .js diretos de src (ignora subpastas de teste)
      if (item.type !== 'file' || !item.name.endsWith('.js') || !item.download_url) continue;

      const fileRes = await fetch(item.download_url);
      if (!fileRes.ok) {
        log(`Erro ao baixar ${item.name}: HTTP ${fileRes.status}`);
        continue;
      }

      const code = await fileRes.text();
      const destPath = path.join(SRC_DIR, item.name);
      await fs.writeFile(destPath, code, 'utf8');
      updatedCount++;
    }

    await saveLocalSha(remoteSha);
    log(`✔ Atualização concluída com sucesso (${updatedCount} arquivos atualizados para ${remoteSha.slice(0, 7)}).`);
    return true;
  } catch (err) {
    log('Verificação de atualização ignorada (sem internet ou erro de rede):', err.message);
    return false;
  }
}
