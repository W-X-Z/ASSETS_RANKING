const CACHE_PREFIX = 'finance_data_';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간
const API_BASE_URL = 'http://localhost:3000/api/yahoo-finance';

export class YahooFinanceService {
    static async getHistoricalData(symbol, startDate, endDate) {
        const cacheKey = `${CACHE_PREFIX}${symbol}_${startDate.getTime()}_${endDate.getTime()}`;
        const cachedData = this.getFromCache(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }

        try {
            const period1 = Math.floor(startDate.getTime() / 1000);
            const period2 = Math.floor(endDate.getTime() / 1000);
            
            const response = await fetch(
                `${API_BASE_URL}/${symbol}?period1=${period1}&period2=${period2}&interval=1d`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            this.saveToCache(cacheKey, data);
            return data;
        } catch (error) {
            console.error(`Failed to fetch data for ${symbol}:`, error);
            throw error;
        }
    }

    static getFromCache(key) {
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp > CACHE_DURATION) {
            localStorage.removeItem(key);
            return null;
        }

        return data;
    }

    static saveToCache(key, data) {
        const cacheData = {
            timestamp: Date.now(),
            data
        };
        localStorage.setItem(key, JSON.stringify(cacheData));
    }
} 