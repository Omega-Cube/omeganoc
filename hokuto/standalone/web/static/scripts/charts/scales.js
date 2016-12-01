/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';

define(['libs/d3','onoc.units'],function(d3,Units){
    /**
     * Manage a scale
     * @class
     * @param {String} name - The scale name
     * @property {d3Scale} y - focus y axis scale object
     * @property {d3Scale} y2 - context y axis scale object
     * @property {d3Axis} yAxis - Axis object
     * @property {String} orient - current orient (left|right)
     * @property {Boolean} reversed - define direction, if true set the scale to bottom mode
     * @property {Boolean} log - Logarithmic mode
     * @property {String} unit - Unit name
     * @property {Function} format - Unit values formating function
     * @property {String} name - The scale name
     * @property {Number} height - focus yAxis height
     * @property {Number} trackHeight - context yAxis height
     * @property {Number} min - Minimum value recorded
     * @property {Number} max - Maximum value recorded
     */
    var DashboardChartScale = function(name){
        this.y = false;
        this.y2 = false;
        this.yAxis = false;
        this.orient = 'left';
        this.reversed = false;
        this.log = false;
        this.unit = '';
        this.format = function(d){
            return Units.unitFormat(d,Units.units[this.unit]);
        };
        this.name = name;
        this.height = 0;
        this.trackHeight = 0;
        this.min = 0;
        this.max = 1;
    };

    /**
     * Set the scale configuration
     * @param {Object} options - Set of options for this scale
     */
    DashboardChartScale.prototype.set = function(options){
        for(var opt in options)
            this[opt] = options[opt];
        if(options.reversed)
            this.reversed = (options.reversed === 'true');
    };

    /**
     * Build and return the yAxis
     */
    DashboardChartScale.prototype.getAxis = function(){
        this.yAxis = d3.svg.axis().scale(this.y);
        this.yAxis.orient(this.orient);
        if(!this.log)
            this.yAxis.ticks(5).tickFormat(this.format.bind(this));
        else
            this.yAxis.ticks(5,this.format.bind(this));
        return this.yAxis;
    };

    /**
     * Build scale
     * @param {Boolean} log - Logarithmic mode
     */
    DashboardChartScale.prototype.build = function(log){
        this.log = log;
        if(!log){
            this.y = d3.scale.linear();
            this.y.ticks(5);
            this.y.tickFormat(this.format.bind(this));
        }else{
            this.y = d3.scale.log();
            this.y.tickFormat(5,this.format.bind(this));
        }
        this.y2 = d3.scale.linear();

        if(!this.reversed){
            this.y.range([this.height, 0]);
            this.y2.range([this.trackHeight, 0]);
        }else{
            this.y.range([this.height, this.height * 2]);
            this.y2.range([this.trackHeight, this.trackHeight * 2]);
        }
    };

    /**
     * Update scale min/max range
     * @param {Object} data - probes data
     */
    DashboardChartScale.prototype.updateDomain = function(data){
        var max = this.max, min = this.min;
        //if data.range is undefined we are manipulating a stacked probe
        if(!data.range){
            for(var d in data){
                max = data[d].y0 + data[d].y;
                if(max > this.max) this.max = max;
                min = data[d].y;
                if(typeof this.min === 'boolean'){
                    this.min = min;
                    continue;
                }
                if(min < this.min)
                    this.min = min;
            }
        }else{
            if(data.range[0] < this.min)
                this.min = data.range[0];
            if(data.range[1] > this.max)
                this.max = data.range[1];
        }
        if(this.log && this.min <= 0)
            this.min = 0.0001;

        this.y.domain([this.min, this.max]).nice().tickFormat(5);
        if(this.log){
            var _tmp = this.y;
            this.y = function(d){
                var ret= 0;
                if(!d || d < 0)
                    ret= _tmp(this.min);
                else
                    ret = _tmp(d);
                return ret;
            }.bind(this);
            for(var p in _tmp)
                this.y[p] = _tmp[p];
        }
        this.y2.domain([this.min, this.max]);
    };

    return DashboardChartScale;
});
