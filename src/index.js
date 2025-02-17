import { YahooFinanceService } from './services/yahooFinanceService.js';
import * as d3 from 'd3';

const ASSETS = [
    { symbol: 'GLD', name: '금', color: '#FFD700' },          // SPDR Gold Shares ETF
    { symbol: 'SPY', name: 'S&P500', color: '#1f77b4' },      // S&P 500 ETF
    { symbol: 'GBTC', name: '비트코인', color: '#FF9900' },   // Grayscale Bitcoin Trust
    { symbol: 'AGG', name: '채권', color: '#2ca02c' },        // iShares Core U.S. Aggregate Bond ETF
    { symbol: 'EWY', name: 'KOSPI', color: '#d62728' },       // iShares MSCI South Korea ETF
    { symbol: 'QQQ', name: 'Nasdaq', color: '#9467bd' },      // Invesco QQQ Trust (Nasdaq-100 ETF)
    { symbol: 'VNQ', name: '부동산', color: '#8c564b' }       // Vanguard Real Estate ETF
];

class AssetReturnsChart {
    constructor() {
        this.margin = { top: 20, right: 160, bottom: 30, left: 80 };
        this.width = 700 - this.margin.left - this.margin.right;
        this.height = 380 - this.margin.top - this.margin.bottom;
        this.selectedAssets = new Set(ASSETS.map(a => a.symbol)); // 선택된 자산군 관리
        
        this.initializeUI();
        this.loadData('YTD');
    }

    initializeUI() {
        const controls = d3.select('#app')
            .insert('div', '#chart')
            .attr('class', 'controls-container');

        // 기간 선택 버튼
        const periodControls = controls.append('div')
            .attr('class', 'controls period-controls');

        periodControls.selectAll('button')
            .data(['YTD', 'MTD'])
            .enter()
            .append('button')
            .attr('class', d => `chip ${d === 'YTD' ? 'active' : ''}`)
            .text(d => d)
            .on('click', (event, d) => {
                periodControls.selectAll('button').classed('active', false);
                d3.select(event.target).classed('active', true);
                this.loadData(d);
            });

        // 자산군 필터 버튼
        const filterButton = controls.append('div')
            .attr('class', 'controls filter-controls')
            .append('button')
            .attr('class', 'chip filter-button')
            .text('자산군 필터')
            .on('click', () => this.toggleFilterPanel());

        // 필터 패널
        this.filterPanel = controls.append('div')
            .attr('class', 'filter-panel')
            .style('display', 'none');

        // 필터 옵션 추가
        this.filterPanel.selectAll('label')
            .data(ASSETS)
            .enter()
            .append('label')
            .attr('class', 'filter-option')
            .html(d => `
                <input type="checkbox" 
                       value="${d.symbol}" 
                       ${this.selectedAssets.has(d.symbol) ? 'checked' : ''}>
                <span style="color: ${d.color}">${d.name}</span>
            `)
            .on('change', (event, d) => {
                const checkbox = event.target;
                if (checkbox.checked) {
                    this.selectedAssets.add(d.symbol);
                } else {
                    this.selectedAssets.delete(d.symbol);
                }
                this.loadData(this.getCurrentPeriod());
            });

        // SVG 초기화
        this.svg = d3.select('#chart')
            .append('svg')
            .attr('width', this.width + this.margin.left + this.margin.right)
            .attr('height', this.height + this.margin.top + this.margin.bottom)
            .append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
    }

    getCurrentPeriod() {
        return d3.select('.period-controls .active').text();
    }

    toggleFilterPanel() {
        const panel = this.filterPanel;
        const isHidden = panel.style('display') === 'none';
        panel.style('display', isHidden ? 'block' : 'none');
        d3.select('.filter-button').classed('active', isHidden);
    }

    async loadData(period) {
        try {
            const dates = this.getDateRangeForPeriod(period);
            // 선택된 자산군만 필터링
            const filteredAssets = ASSETS.filter(asset => this.selectedAssets.has(asset.symbol));
            const assetData = await Promise.all(
                filteredAssets.map(async asset => {
                    // 첫 번째 기간 데이터 가져오기
                    const data1 = await YahooFinanceService.getHistoricalData(
                        asset.symbol,
                        dates.startDate1,
                        dates.endDate1
                    );
                    // 두 번째 기간 데이터 가져오기
                    const data2 = await YahooFinanceService.getHistoricalData(
                        asset.symbol,
                        dates.startDate2,
                        dates.endDate2
                    );
                    return this.calculateReturns(data1, data2, asset, dates);
                })
            );

            this.drawSlopeChart(assetData, dates);
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    }

    getDateRangeForPeriod(period) {
        const now = new Date();
        let startDate1, startDate2, endDate1, endDate2;
        
        switch(period) {
            case 'YTD':
                // 작년 1월 1일 ~ 12월 31일 vs 올해 1월 1일 ~ 현재
                startDate1 = new Date(now.getFullYear() - 1, 0, 1);
                endDate1 = new Date(now.getFullYear() - 1, 11, 31);
                startDate2 = new Date(now.getFullYear(), 0, 1);
                endDate2 = now;
                break;
            case 'MTD':
                // 저번 달 1일 ~ 말일 vs 이번 달 1일 ~ 현재
                startDate1 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                endDate1 = new Date(now.getFullYear(), now.getMonth(), 0);
                startDate2 = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate2 = now;
                break;
            default:
                throw new Error('지원하지 않는 기간입니다.');
        }
        
        return { startDate1, endDate1, startDate2, endDate2 };
    }

    calculateReturns(data1, data2, asset, dates) {
        // 첫 번째 기간의 수익률 계산
        const prices1 = data1.chart.result[0].indicators.quote[0].close;
        const startPrice1 = prices1[0];
        const endPrice1 = prices1[prices1.length - 1];
        const returns1 = ((endPrice1 - startPrice1) / startPrice1) * 100;

        // 두 번째 기간의 수익률 계산
        const prices2 = data2.chart.result[0].indicators.quote[0].close;
        const startPrice2 = prices2[0];
        const endPrice2 = prices2[prices2.length - 1];
        const returns2 = ((endPrice2 - startPrice2) / startPrice2) * 100;

        return {
            name: asset.name,
            color: asset.color,
            startReturn: parseFloat(returns1.toFixed(2)),  // 첫 번째 기간 수익률
            endReturn: parseFloat(returns2.toFixed(2))     // 두 번째 기간 수익률
        };
    }

    drawSlopeChart(data, dates) {
        // 기존 차트 삭제
        this.svg.selectAll('*').remove();

        const y = d3.scaleLinear()
            .domain([
                d3.min(data, d => Math.min(d.startReturn, d.endReturn)) - 3,
                d3.max(data, d => Math.max(d.startReturn, d.endReturn)) + 3
            ])
            .range([this.height, 0]);

        // X축 레이블 (왼쪽)
        this.svg.append('text')
            .attr('class', 'period-label')
            .attr('x', 0)
            .attr('y', this.height + 25)
            .attr('text-anchor', 'middle')
            .text(this.formatPeriodLabel(dates.startDate1, dates.endDate1));

        // X축 레이블 (오른쪽)
        this.svg.append('text')
            .attr('class', 'period-label')
            .attr('x', this.width)
            .attr('y', this.height + 25)
            .attr('text-anchor', 'middle')
            .text(this.formatPeriodLabel(dates.startDate2, dates.endDate2));

        // X축 구분선
        this.svg.append('line')
            .attr('x1', 0)
            .attr('y1', this.height)
            .attr('x2', 0)
            .attr('y2', this.height + 10)
            .attr('stroke', '#666')
            .attr('stroke-width', 1);

        this.svg.append('line')
            .attr('x1', this.width)
            .attr('y1', this.height)
            .attr('x2', this.width)
            .attr('y2', this.height + 10)
            .attr('stroke', '#666')
            .attr('stroke-width', 1);

        // 데이터를 endReturn 기준으로 정렬
        data.sort((a, b) => b.endReturn - a.endReturn);

        // 각 자산군에 대한 그룹 생성
        const assetGroups = this.svg.selectAll('.asset-group')
            .data(data)
            .enter()
            .append('g')
            .attr('class', 'asset-group')
            .style('opacity', (d, i) => i === 0 ? 1 : 0.5); // 투명도 0.3 -> 0.5로 증가

        // 라인 그리기
        assetGroups.append('line')
            .attr('x1', 0)
            .attr('y1', d => y(d.startReturn))
            .attr('x2', this.width)
            .attr('y2', d => y(d.endReturn))
            .attr('stroke', d => d.color)
            .attr('stroke-width', 2);

        // 시작점과 끝점 (크기 증가)
        const circleRadius = 5; // 4 -> 5로 증가
        assetGroups.append('circle')
            .attr('cx', 0)
            .attr('cy', d => y(d.startReturn))
            .attr('r', circleRadius)
            .attr('fill', d => d.color);

        assetGroups.append('circle')
            .attr('cx', this.width)
            .attr('cy', d => y(d.endReturn))
            .attr('r', circleRadius)
            .attr('fill', d => d.color);

        // 수익률 레이블 그룹
        const labelGroups = assetGroups.append('g')
            .attr('class', 'label-group');

        // 시작 수익률 (위치 및 스타일 수정)
        labelGroups.append('text')
            .attr('class', 'return-label')
            .attr('x', -10)
            .attr('y', d => y(d.startReturn))
            .attr('text-anchor', 'end')
            .attr('alignment-baseline', 'middle')
            .style('font-size', '12px')
            .style('font-weight', '600')
            .style('opacity', 0)
            .text(d => `${d.startReturn}%`);

        // 끝 수익률 (위치 및 스타일 수정)
        labelGroups.append('text')
            .attr('class', 'return-label')
            .attr('x', this.width + 10)
            .attr('y', d => y(d.endReturn))
            .attr('alignment-baseline', 'middle')
            .style('font-size', '12px')
            .style('font-weight', '600')
            .style('opacity', 0)
            .text(d => `${d.endReturn}%`);

        // 자산명 레이블 위치 수정
        labelGroups.append('text')
            .attr('class', 'asset-label')
            .attr('x', this.width + 65)
            .attr('y', d => y(d.endReturn))
            .attr('alignment-baseline', 'middle')
            .attr('fill', d => d.color)
            .style('font-weight', '500')
            .text(d => d.name);

        // 호버 이벤트 개선
        assetGroups
            .on('mouseenter', function(event, d) {
                // 다른 자산군 흐리게
                d3.selectAll('.asset-group')
                    .style('opacity', 0.2)
                    .selectAll('.return-label')
                    .style('opacity', 0);

                // 현재 자산군 강조
                d3.select(this)
                    .style('opacity', 1)
                    .raise()  // 현재 그룹을 맨 위로
                    .selectAll('.return-label')
                    .style('opacity', 1)  // 수익률 표시
                    .style('fill', d => d.color);  // 수익률 색상 변경
            })
            .on('mouseleave', function(event, d) {
                // 모든 자산군 원래대로
                d3.selectAll('.asset-group')
                    .style('opacity', (d, i) => i === 0 ? 1 : 0.5)
                    .selectAll('.return-label')
                    .style('opacity', 0);  // 모든 수익률 숨김

                // 첫 번째 자산군 수익률만 표시
                d3.select(d3.selectAll('.asset-group').nodes()[0])
                    .raise()
                    .selectAll('.return-label')
                    .style('opacity', 1)
                    .style('fill', d => d.color);
            });

        // 첫 번째 자산군의 수익률 표시
        d3.select(assetGroups.nodes()[0])
            .selectAll('.return-label')
            .style('opacity', 1)
            .style('fill', d => d.color);
    }

    formatPeriodLabel(startDate, endDate) {
        const isSameYear = startDate.getFullYear() === endDate.getFullYear();
        const isSameMonth = startDate.getMonth() === endDate.getMonth();
        const isSameDay = startDate.getDate() === endDate.getDate();

        if (isSameDay) {
            // 같은 날짜인 경우 (Daily)
            return startDate.toLocaleDateString('ko-KR', {
                month: 'short',
                day: 'numeric'
            });
        } else if (isSameMonth) {
            // 같은 달인 경우
            return startDate.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short'
            });
        } else if (isSameYear) {
            // 같은 연도인 경우
            return startDate.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short'
            }) + ' ~\n' + 
            endDate.toLocaleDateString('ko-KR', {
                month: 'short'
            });
        } else {
            // 다른 연도인 경우
            return startDate.toLocaleDateString('ko-KR', {
                year: 'numeric'
            });
        }
    }
}

// 차트 초기화
new AssetReturnsChart(); 