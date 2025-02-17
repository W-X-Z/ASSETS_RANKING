const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

app.get('/api/yahoo-finance/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { period1, period2, interval } = req.query;

        if (!period1 || !period2 || isNaN(period1) || isNaN(period2)) {
            return res.status(400).json({ 
                error: '유효하지 않은 날짜 범위입니다.',
                details: { period1, period2 }
            });
        }

        const response = await axios.get(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
            {
                params: { period1, period2, interval },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br'
                },
                timeout: 5000 // 5초 타임아웃 설정
            }
        );

        if (!response.data || !response.data.chart || !response.data.chart.result) {
            throw new Error('Invalid response from Yahoo Finance API');
        }

        res.json(response.data);
    } catch (error) {
        console.error('Yahoo Finance API 에러:', error.message);
        
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.error || error.message;
        
        res.status(statusCode).json({ 
            error: '데이터를 가져오는데 실패했습니다.',
            details: errorMessage
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행중입니다.`);
}); 