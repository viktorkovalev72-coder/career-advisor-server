import express from 'express';
import cors from 'cors';
import axios from 'axios';
import {
  getStatistics,
  addSearchToStats,
  addExportToStats,
  getTopKeywords,
  getTopCities,
  clearStatistics,
  exportStatisticsToJSON,
  exportStatisticsToCSV,
} from './services/statistics.js';

const app = express();
const PORT = process.env.PORT || 4000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2024';

// Разрешаем CORS для фронтенда
app.use(cors());
app.use(express.json());

// Логирование запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============ ГЛАВНАЯ СТРАНИЦА ============
app.get('/', (req, res) => {
  res.json({
    name: 'Карьерный консультант PRO - Сервер API',
    version: '1.1.0',
    status: 'running',
    description: 'Сервер для поиска вакансий через API hh.ru и Работа России с системой статистики',
    endpoints: {
      health: '/api/health',
      hh_vacancies: '/api/hh/vacancies',
      trudvsem_vacancies: '/api/trudvsem/vacancies',
      search: '/api/search (POST)',
      stats: '/api/stats (GET, требует авторизации)',
      stats_search: '/api/stats/search (POST)',
      stats_export: '/api/stats/export (POST)',
    },
    documentation: 'https://github.com/viktorkovalev72-coder/career-advisor',
    author: 'Кадровый центр "Работа России" Чувашской Республики',
  });
});

// ============ БАЗОВАЯ ИНФОРМАЦИЯ О API ============
app.get('/api', (req, res) => {
  res.json({
    name: 'Career Advisor API',
    version: '1.1.0',
    endpoints: [
      {
        method: 'GET',
        path: '/api/health',
        description: 'Проверка работоспособности сервера',
      },
      {
        method: 'GET',
        path: '/api/hh/vacancies',
        description: 'Поиск вакансий на hh.ru',
        parameters: ['text', 'area', 'per_page', 'page', 'salary', 'employment', 'experience'],
      },
      {
        method: 'GET',
        path: '/api/trudvsem/vacancies',
        description: 'Поиск вакансий на Работа России',
        parameters: ['text', 'region', 'limit', 'offset', 'salary_min', 'salary_max'],
      },
      {
        method: 'POST',
        path: '/api/search',
        description: 'Комплексный поиск по нескольким ключевым словам',
        body: ['keywords', 'cityId', 'regionCode', 'salaryFrom', 'salaryTo', 'employment', 'experience'],
      },
      {
        method: 'GET',
        path: '/api/stats',
        description: 'Получить общую статистику (требует авторизации)',
        headers: ['x-admin-password'],
      },
      {
        method: 'POST',
        path: '/api/stats/search',
        description: 'Добавить поиск в статистику',
        body: ['keywords', 'city', 'cityId', 'salaryFrom', 'salaryTo', 'employment', 'experience', 'resultsCount'],
      },
      {
        method: 'POST',
        path: '/api/stats/export',
        description: 'Добавить экспорт в статистику',
        body: ['type'],
      },
      {
        method: 'DELETE',
        path: '/api/stats',
        description: 'Очистить статистику (требует авторизации)',
        headers: ['x-admin-password'],
      },
    ],
  });
});

// ============ HEADHUNTER API ============
app.get('/api/hh/vacancies', async (req, res) => {
  try {
    const { text, area, per_page, page, salary, employment, experience } = req.query;
    
    const params = new URLSearchParams();
    if (text) params.append('text', text);
    // Если area не указан или равен 113, используем 1 (Россия)
    const areaId = (!area || area === '113') ? '1' : area;
    params.append('area', areaId);
    if (per_page) params.append('per_page', per_page);
    if (page) params.append('page', page);
    if (salary) params.append('salary', salary);
    if (employment) params.append('employment', employment);
    if (experience) params.append('experience', experience);
    
    params.append('order_by', 'publication_time');

    console.log(`[HH] Запрос: text=${text}, area=${areaId}`);

    const response = await axios.get(`https://api.hh.ru/vacancies?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    console.log(`[HH] Найдено вакансий: ${response.data.items?.length || 0}`);
    res.json(response.data);
  } catch (error) {
    console.error('[HH] Ошибка:', error.response?.status, error.message);
    if (error.response?.data) {
      console.error('[HH] Детали:', JSON.stringify(error.response.data));
    }
    res.status(error.response?.status || 500).json({ 
      error: error.message,
      items: [] 
    });
  }
});

// ============ TRUDVSEM API ============
app.get('/api/trudvsem/vacancies', async (req, res) => {
  try {
    const { text, region, limit, offset, salary_min, salary_max } = req.query;
    
    const params = new URLSearchParams();
    if (text) params.append('text', text);
    if (region) params.append('region', region);
    if (limit) params.append('limit', limit);
    if (offset) params.append('offset', offset);
    if (salary_min) params.append('salary_min', salary_min);
    if (salary_max) params.append('salary_max', salary_max);

    const response = await axios.get(`https://api.trudvsem.ru/api/v1/vacancies?${params}`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('TrudVsem API error:', error.message);
    res.status(error.response?.status || 500).json({ 
      error: error.message,
      results: { vacancies: [] }
    });
  }
});

// ============ КОМПЛЕКСНЫЙ ПОИСК ============
app.post('/api/search', async (req, res) => {
  try {
    const { keywords, cityId, regionCode, salaryFrom, salaryTo, employment, experience } = req.body;
    
    console.log(`\n🔍 Начало поиска:`);
    console.log(`   Ключевые слова: ${keywords.join(', ')}`);
    console.log(`   Город ID: ${cityId}`);
    console.log(`   Регион код: ${regionCode}`);
    
    const allVacancies = [];

    // Поиск на HH по каждому ключевому слову
    for (const keyword of keywords) {
      try {
        console.log(`\n📋 HH: Поиск "${keyword}"...`);
        
        // Получаем до 5 страниц
        for (let page = 0; page < 5; page++) {
          // Если cityId не указан или равен 113, используем 1 (Россия)
          const areaId = (!cityId || cityId === 113) ? 1 : cityId;
          
          const params = new URLSearchParams({
            text: keyword,
            area: String(areaId),
            per_page: '100',
            page: String(page),
            order_by: 'publication_time',
          });

          if (salaryFrom) params.append('salary', String(salaryFrom));
          if (employment && employment.length > 0) {
            employment.forEach(emp => params.append('employment', emp));
          }
          if (experience && experience.length > 0) {
            experience.forEach(exp => params.append('experience', exp));
          }

          console.log(`[HH] Страница ${page + 1}, area=${areaId}`);

          const response = await axios.get(`https://api.hh.ru/vacancies?${params}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json',
              'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            },
          });

          const items = response.data?.items || [];
          console.log(`   Страница ${page + 1}: найдено ${items.length} вакансий`);
          
          if (items.length === 0) break;

          const vacancies = items.map(item => ({
            id: `hh-${item.id}`,
            title: item.name,
            company: item.employer?.name || 'Не указано',
            salary: item.salary
              ? `${item.salary.from || ''} ${item.salary.to || ''} ${item.salary.currency || 'RUR'}`.trim()
              : undefined,
            salaryFrom: item.salary?.from,
            salaryTo: item.salary?.to,
            location: item.area?.name || '',
            url: item.alternate_url || `https://hh.ru/vacancy/${item.id}`,
            source: 'hh.ru',
            datePublished: item.published_at ? new Date(item.published_at).toLocaleDateString('ru-RU') : undefined,
            description: item.snippet?.responsibility || '',
            employment: item.employment?.name || '',
            experience: item.experience?.name || '',
          }));

          allVacancies.push(...vacancies);
          if (items.length < 100) break;

          await new Promise(r => setTimeout(r, 300));
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.error(`❌ HH error for "${keyword}":`, error.message);
      }
    }

    // Поиск на TrudVsem по каждому ключевому слову
    for (const keyword of keywords) {
      try {
        console.log(`\n📋 TrudVsem: Поиск "${keyword}"...`);
        
        for (let offset = 0; offset < 500; offset += 50) {
          const params = new URLSearchParams({
            text: keyword,
            limit: '50',
            offset: String(offset),
          });

          // Добавляем region только если указан
          if (regionCode) {
            params.append('region', regionCode);
          }

          if (salaryFrom) params.append('salary_min', String(salaryFrom));
          if (salaryTo) params.append('salary_max', String(salaryTo));

          console.log(`[TrudVsem] Offset ${offset}, region=${regionCode || 'все'}`);

          const response = await axios.get(`https://api.trudvsem.ru/api/v1/vacancies?${params}`, {
            headers: { 
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 10000,
          });

          const items = response.data?.results?.vacancies || [];
          console.log(`   Offset ${offset}: найдено ${items.length} вакансий`);
          
          if (items.length === 0) break;

          const vacancies = items.map((item, index) => {
            const v = item.vacancy || item;
            return {
              id: `trud-${keyword}-${offset}-${index}-${Date.now()}`,
              title: v.job_title || v.title || 'Не указано',
              company: v.company_name || v.employer || 'Не указано',
              salary: v.salary ? `${v.salary} руб.` : undefined,
              salaryFrom: v.salary ? parseInt(v.salary) : undefined,
              location: v.location_name || v.region || 'Россия',
              url: v.vacancy_url || 'https://trudvsem.ru',
              source: 'Работа России',
              datePublished: v.creation_date ? new Date(v.creation_date).toLocaleDateString('ru-RU') : undefined,
              description: v.duties || '',
              employment: v.employment || '',
            };
          });

          allVacancies.push(...vacancies);
          if (items.length < 50) break;

          await new Promise(r => setTimeout(r, 300));
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.error(`❌ TrudVsem error for "${keyword}":`, error.message);
        if (error.response) {
          console.error(`   Status: ${error.response.status}`);
          console.error(`   Data:`, error.response.data);
        }
      }
    }

    console.log(`\n✅ Поиск завершён. Всего найдено: ${allVacancies.length} вакансий\n`);

    res.json({ 
      success: true, 
      total: allVacancies.length, 
      vacancies: allVacancies 
    });
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message, 
      vacancies: [] 
    });
  }
});

// ============ СТАТИСТИКА ============

// Middleware для проверки пароля администратора
const checkAdminAuth = (req, res, next) => {
  const password = req.headers['x-admin-password'];
  if (password === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Неверный пароль администратора' });
  }
};

// Получить общую статистику (только для админа)
app.get('/api/stats', checkAdminAuth, (req, res) => {
  try {
    const stats = getStatistics();
    const topKeywords = getTopKeywords(10);
    const topCities = getTopCities(10);
    
    res.json({
      success: true,
      data: {
        ...stats,
        uniqueUsers: Array.from(stats.uniqueUsers),
        topKeywords,
        topCities,
      }
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Добавить поиск в статистику (публичный эндпоинт)
app.post('/api/stats/search', (req, res) => {
  try {
    const search = req.body;
    
    // Генерируем userId на основе IP и User-Agent
    const userId = req.ip + '_' + (req.headers['user-agent'] || 'unknown');
    search.userId = userId;
    
    const newSearch = addSearchToStats(search);
    
    console.log(`📊 Статистика: новый поиск от ${userId} - ${search.keywords.join(', ')} в ${search.city}`);
    
    res.json({
      success: true,
      data: newSearch
    });
  } catch (error) {
    console.error('Error adding search to stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Добавить экспорт в статистику (публичный эндпоинт)
app.post('/api/stats/export', (req, res) => {
  try {
    const exportData = req.body;
    addExportToStats(exportData);
    
    console.log(`📊 Статистика: экспорт ${exportData.type}`);
    
    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error adding export to stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Очистить статистику (только для админа)
app.delete('/api/stats', checkAdminAuth, (req, res) => {
  try {
    clearStatistics();
    console.log('🗑️ Статистика очищена администратором');
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Экспорт статистики в JSON (только для админа)
app.get('/api/stats/export/json', checkAdminAuth, (req, res) => {
  try {
    const json = exportStatisticsToJSON();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=statistics_${new Date().toISOString().split('T')[0]}.json`);
    res.send(json);
  } catch (error) {
    console.error('Error exporting statistics to JSON:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Экспорт статистики в CSV (только для админа)
app.get('/api/stats/export/csv', checkAdminAuth, (req, res) => {
  try {
    const csv = exportStatisticsToCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=statistics_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting statistics to CSV:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ПРОВЕРКА РАБОТОСПОСОБНОСТИ ============
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    version: '1.1.0'
  });
});

// ============ СТАТИСТИКА ============

const checkAdminAuth = (req, res, next) => {
  const password = req.headers['x-admin-password'];
  if (password === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Неверный пароль администратора' });
  }
};

app.get('/api/stats', checkAdminAuth, (req, res) => {
  try {
    const stats = getStatistics();
    const topKeywords = getTopKeywords(10);
    const topCities = getTopCities(10);
    
    res.json({
      success: true,
       {
        ...stats,
        uniqueUsers: Array.from(stats.uniqueUsers),
        topKeywords,
        topCities,
      }
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/stats/search', (req, res) => {
  try {
    const search = req.body;
    const userId = req.ip + '_' + (req.headers['user-agent'] || 'unknown');
    search.userId = userId;
    
    const newSearch = addSearchToStats(search);
    
    console.log(`📊 Статистика: новый поиск от ${userId}`);
    
    res.json({
      success: true,
       newSearch
    });
  } catch (error) {
    console.error('Error adding search to stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/stats/export', (req, res) => {
  try {
    const exportData = req.body;
    addExportToStats(exportData);
    
    console.log(`📊 Статистика: экспорт ${exportData.type}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding export to stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/stats', checkAdminAuth, (req, res) => {
  try {
    clearStatistics();
    console.log('🗑️ Статистика очищена');
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/stats/export/json', checkAdminAuth, (req, res) => {
  try {
    const json = exportStatisticsToJSON();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=statistics_${new Date().toISOString().split('T')[0]}.json`);
    res.send(json);
  } catch (error) {
    console.error('Error exporting to JSON:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/stats/export/csv', checkAdminAuth, (req, res) => {
  try {
    const csv = exportStatisticsToCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=statistics_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ СТАРТ СЕРВЕРА ============
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n📋 API endpoints:`);
  console.log(`   GET  /api/health - проверка работоспособности`);
  console.log(`   GET  /api/hh/vacancies - поиск на hh.ru`);
  console.log(`   GET  /api/trudvsem/vacancies - поиск на trudvsem.ru`);
  console.log(`   POST /api/search - комплексный поиск`);
  console.log(`\n${'='.repeat(60)}\n`);
});
