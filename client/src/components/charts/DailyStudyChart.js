import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useLanguage } from '../../context/LanguageContext';
import './ChartStyles.css';

const DailyStudyChart = ({ data, width = 800, height = 300 }) => {
  const { t } = useLanguage();
  const svgRef = useRef();
  const tooltipRef = useRef();

  useEffect(() => {
    if (!data || data.length === 0) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current);
    const isLongRange = data.length > 14;
    const bottomMargin = isLongRange ? 60 : 40; // More space for rotated labels
    const adjustedHeight = isLongRange ? height + 40 : height;
    const margin = { top: 20, right: 30, bottom: bottomMargin, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = adjustedHeight - margin.top - margin.bottom;

    // Create tooltip
    const tooltip = d3.select(tooltipRef.current);

    // Set up scales. Use the ISO date key (`d.date`) as the band domain so
    // that days sharing a display label (e.g. two March-15ths across
    // different years in a long custom range) don't collapse onto a single
    // bar and silently drop data. The human-readable label is still used
    // as the tick text via a lookup below.
    const labelByDate = new Map(data.map(d => [d.date, d.dateLabel]));
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.date))
      .range([0, chartWidth])
      .padding(0.1);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.minutes) || 60])
      .nice()
      .range([chartHeight, 0]);

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add axes
    // For 30 days, show fewer labels and rotate them
    const xAxis = d3.axisBottom(xScale)
      .tickSize(0)
      .tickPadding(10)
      .tickFormat(d => labelByDate.get(d) || d)
      .ticks(isLongRange ? Math.min(data.length, 15) : data.length); // Show fewer ticks for long ranges

    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => `${d}m`)
      .tickSize(0)
      .tickPadding(10);

    const xAxisGroup = g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(xAxis);

    // Style and rotate labels for long ranges
    xAxisGroup.selectAll("text")
      .style("fill", "#9ca3af")
      .style("font-size", isLongRange ? "10px" : "12px")
      .attr("transform", isLongRange ? "rotate(-45)" : "rotate(0)")
      .attr("dx", isLongRange ? "-5px" : "0")
      .attr("dy", isLongRange ? "10px" : "0")
      .style("text-anchor", isLongRange ? "end" : "middle");

    g.append("g")
      .attr("class", "y-axis")
      .call(yAxis)
      .selectAll("text")
      .style("fill", "#9ca3af")
      .style("font-size", "12px");

    // Add grid lines
    g.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(d3.axisBottom(xScale).tickSize(-chartHeight).tickFormat(""))
      .selectAll("line")
      .style("stroke", "#374151")
      .style("stroke-dasharray", "2,2")
      .style("opacity", 0.3);

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-chartWidth).tickFormat(""))
      .selectAll("line")
      .style("stroke", "#374151")
      .style("stroke-dasharray", "2,2")
      .style("opacity", 0.3);

    // Create line generator
    const line = d3.line()
      .x(d => xScale(d.date) + xScale.bandwidth() / 2)
      .y(d => yScale(d.minutes))
      .curve(d3.curveMonotoneX);

    // Add area under line
    const area = d3.area()
      .x(d => xScale(d.date) + xScale.bandwidth() / 2)
      .y0(chartHeight)
      .y1(d => yScale(d.minutes))
      .curve(d3.curveMonotoneX);

    // Add area
    g.append("path")
      .datum(data)
      .attr("fill", "url(#areaGradient)")
      .attr("d", area)
      .style("opacity", 0.3);

    // Add line
    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 3)
      .attr("d", line);

    // Add circles for data points
    const circles = g.selectAll(".data-point")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "data-point")
      .attr("cx", d => xScale(d.date) + xScale.bandwidth() / 2)
      .attr("cy", d => yScale(d.minutes))
      .attr("r", 5)
      .attr("fill", "#3b82f6")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("mouseover", function(event, d) {
        d3.select(this)
          .attr("r", 7)
          .attr("fill", "#60a5fa");

        // Get tooltip dimensions for positioning
        tooltip
          .style("opacity", 1)
          .html(`
            <div class="tooltip-content">
              <strong>${d.dateLabel}</strong><br/>
              ${d.minutes} ${t('analytics.minutes')}<br/>
              ${Math.round((d.minutes / 60) * 10) / 10}h
            </div>
          `);

        // Use clientX/clientY (viewport-relative) instead of pageX/pageY
        const tooltipWidth = tooltip.node().offsetWidth || 150;
        const tooltipHeight = tooltip.node().offsetHeight || 80;
        const padding = 10;
        
        let left = event.clientX + padding;
        let top = event.clientY - padding;
        
        // Keep tooltip within viewport bounds
        if (left + tooltipWidth > window.innerWidth) {
          left = event.clientX - tooltipWidth - padding;
        }
        if (top + tooltipHeight > window.innerHeight) {
          top = event.clientY - tooltipHeight - padding;
        }
        if (left < 0) left = padding;
        if (top < 0) top = padding;

        tooltip
          .style("left", left + "px")
          .style("top", top + "px");
      })
      .on("mouseout", function() {
        d3.select(this)
          .attr("r", 5)
          .attr("fill", "#3b82f6");

        tooltip.style("opacity", 0);
      });

    // Add gradient definition
    const defs = svg.append("defs");
    const areaGradient = defs.append("linearGradient")
      .attr("id", "areaGradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    areaGradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#3b82f6")
      .attr("stop-opacity", 0.4);

    areaGradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#3b82f6")
      .attr("stop-opacity", 0);

    // Update SVG height for rotated labels
    svg.attr("height", adjustedHeight);

    // Cleanup
    return () => {
      d3.select(svgRef.current).selectAll("*").remove();
    };
  }, [data, width, height]);

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <p>{t('analytics.noDataAvailable')}</p>
      </div>
    );
  }

  const isLongRange = data.length > 14;
  const adjustedHeight = isLongRange ? height + 40 : height;

  return (
    <div className="d3-chart-container">
      <svg ref={svgRef} width={width} height={adjustedHeight}></svg>
      <div ref={tooltipRef} className="d3-tooltip"></div>
    </div>
  );
};

export default DailyStudyChart;

