// Серверный сервис для работы со статистикой
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATS_FILE = path.join(__dirname, '../data/statistics.json');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export function getStatistics() {
  try {
    if (!fs.existsSync(STATS_FILE)) {
      return {
        totalSearches: 0,
        totalExports: 0,
        searches: [],
        keywordRating: {},
        cityRating: {},
        employmentRating: {},
        experienceRating: {},
        dailyStats: {},
        uniqueUsers: new Set(),
      };
    }
    const data = fs.readFileSync(STATS_FILE, 'utf-8');
    const stats = JSON.parse(data);
    if (stats.uniqueUsers && Array.isArray(stats.uniqueUsers)) {
      stats.uniqueUsers = new Set(stats.uniqueUsers);
    } else {
      stats.uniqueUsers = new Set();
    }
    return stats;
  } catch (error) {
    console.error('Error reading statistics:', error);
    return {
      totalSearches: 0,
      totalExports: 0,
      searches: [],
      keywordRating: {},
      cityRating: {},
      employmentRating: {},
      experienceRating: {},
      dailyStats: {},
      uniqueUsers: new Set(),
    };
  }
}

export function saveStatistics(stats) {
  try {
    const statsToSave = {
      ...stats,
      uniqueUsers: Array.from(stats.uniqueUsers || []),
    };
    fs.writeFileSync(STATS_FILE, JSON.stringify(statsToSave, null, 2));
  } catch (error) {
    console.error('Error saving statistics:', error);
  }
}

export function addSearchToStats(search) {
  const stats = getStatistics();
  
  const newSearch = {
    ...search,
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
  };
  
  stats.searches.push(newSearch);
  stats.totalSearches++;
  
  if (search.userId) {
    stats.uniqueUsers.add(search.userId);
  }
  
  search.keywords.forEach(keyword => {
    stats.keywordRating[keyword] = (stats.keywordRating[keyword] || 0) + 1;
  });
  
  stats.cityRating[search.city] = (stats.cityRating[search.city] || 0) + 1;
  
  search.employment.forEach(emp => {
    stats.employmentRating[emp] = (stats.employmentRating[emp] || 0) + 1;
  });
  
  search.experience.forEach(exp => {
    stats.experienceRating[exp] = (stats.experienceRating[exp] || 0) + 1;
  });
  
  const today = new Date().toISOString().split('T')[0];
  stats.dailyStats[today] = (stats.dailyStats[today] || 0) + 1;
  
  saveStatistics(stats);
  return newSearch;
}

export function addExportToStats(exportData) {
  const stats = getStatistics();
  stats.totalExports++;
  
  if (stats.searches.length > 0) {
    const lastSearch = stats.searches[stats.searches.length - 1];
    lastSearch.exportedTo = exportData.type;
  }
  
  saveStatistics(stats);
}

export function getTopKeywords(n = 10) {
  const stats = getStatistics();
  return Object.entries(stats.keywordRating)
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export function getTopCities(n = 10) {
  const stats = getStatistics();
  return Object.entries(stats.cityRating)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export function clearStatistics() {
  const emptyStats = {
    totalSearches: 0,
    totalExports: 0,
    searches: [],
    keywordRating: {},
    cityRating: {},
    employmentRating: {},
    experienceRating: {},
    dailyStats: {},
    uniqueUsers: new Set(),
  };
  saveStatistics(emptyStats);
}

export function exportStatisticsToJSON() {
  const stats = getStatistics();
  return JSON.stringify({
    ...stats,
    uniqueUsers: Array.from(stats.uniqueUsers),
  }, null, 2);
}

export function exportStatisticsToCSV() {
  const stats = getStatistics();
  
  let csv = 'Дата,Ключевые слова,Город,Результатов,Экспорт,Пользователь\n';
  
  stats.searches.forEach(search => {
    const date = new Date(search.timestamp).toLocaleString('ru-RU');
    const keywords = search.keywords.join('; ');
    const userId = search.userId || 'anonymous';
    csv += `${date},"${keywords}",${search.city},${search.resultsCount},${search.exportedTo || '-'},${userId}\n`;
  });
  
  return csv;
}
