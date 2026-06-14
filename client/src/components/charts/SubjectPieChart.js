import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useLanguage } from '../../context/LanguageContext';
import './ChartStyles.css';

const SubjectPieChart = ({ data, width = 400, height = 400 }) => {
  const { t } = useLanguage();
  const svgRef = useRef();
  const tooltipRef = useRef();

  useEffect(() => {
    if (!data || data.length === 0) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current);
    const radius = Math.min(width, height) / 2 - 40;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };

    // Create tooltip
    const tooltip = d3.select(tooltipRef.current);

    // Set up pie generator
    const pie = d3.pie()
      .value(d => d.minutes)
      .sort(null)
      .padAngle(0.02);

    // Set up arc generator
    const arc = d3.arc()
      .innerRadius(radius * 0.5) // Donut chart
      .outerRadius(radius);

    // Color scale
    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
      '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'
    ];
    const colorScale = d3.scaleOrdinal()
      .domain(data.map(d => d.subject))
      .range(colors);

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    // Generate pie data
    const arcs = pie(data);

    // Add arcs
    const arcGroups = g.selectAll(".arc")
      .data(arcs)
      .enter()
      .append("g")
      .attr("class", "arc");

    // Add paths
    arcGroups.append("path")
      .attr("d", arc)
      .attr("fill", d => colorScale(d.data.subject))
      .attr("stroke", "#1f2937")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("mouseover", function(event, d) {
        d3.select(this)
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 3)
          .transition()
          .duration(200)
          .attr("transform", `scale(1.05)`);

        const total = d3.sum(data, d => d.minutes);
        const percentage = ((d.data.minutes / total) * 100).toFixed(1);
        const hours = Math.round((d.data.minutes / 60) * 10) / 10;

        // Set tooltip content first to get dimensions
        tooltip
          .style("opacity", 1)
          .html(`
            <div class="tooltip-content">
              <strong>${d.data.subject || t('analytics.uncategorized')}</strong><br/>
              ${d.data.minutes} ${t('analytics.minutes')}<br/>
              ${hours}h<br/>
              ${percentage}% ${t('analytics.ofTotal')}
            </div>
          `);

        // Use clientX/clientY (viewport-relative) instead of pageX/pageY
        const tooltipWidth = tooltip.node().offsetWidth || 150;
        const tooltipHeight = tooltip.node().offsetHeight || 100;
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
          .attr("stroke", "#1f2937")
          .attr("stroke-width", 2)
          .transition()
          .duration(200)
          .attr("transform", `scale(1)`);

        tooltip.style("opacity", 0);
      });

    // Add labels for larger slices
    arcGroups.append("text")
      .attr("transform", d => {
        const [x, y] = arc.centroid(d);
        return `translate(${x},${y})`;
      })
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .style("fill", "#ffffff")
      .style("font-size", "12px")
      .style("font-weight", "600")
      .text(d => {
        const percentage = ((d.data.minutes / d3.sum(data, d => d.minutes)) * 100).toFixed(0);
        return percentage > 5 ? `${percentage}%` : '';
      });

    // Legend will be rendered as HTML element outside SVG

    // Cleanup
    return () => {
      d3.select(svgRef.current).selectAll("*").remove();
    };
  }, [data, width, height]);

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <p>{t('analytics.noSubjectData')}</p>
      </div>
    );
  }

  return (
    <div className="d3-chart-container">
      <svg ref={svgRef} width={width} height={height}></svg>
      <div ref={tooltipRef} className="d3-tooltip"></div>
    </div>
  );
};

export default SubjectPieChart;

