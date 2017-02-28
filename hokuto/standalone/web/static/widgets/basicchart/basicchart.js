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

define(['dashboards.probes', 'charts/charts'], function (DashboardProbes, DashboardChart) {
    /**
     * Handle differents kind of chart
     * Only visual and rendering operations will be done here
     * The widget is generated from the attachTo method (TODO: revamp or rename should be done here)
     */
    var BasicChart = function() {
        this.id = -1;
        this.chart= new DashboardChart();
    };

    BasicChart.prototype.attachTo = function (container, options) {
        this.id = options.id;
        this.chart.init(container, options);
    };

    /**
     * Called when this widget is deleted
     */
    BasicChart.prototype.remove = function(){
        DashboardProbes.removeSignature(this.id);
    };

    BasicChart.default = function () {
        return {
            width: 9,
            height: 7,
            conf: {
                'frequency': 1000,
                'probes':{}
            }
        };
    };

    return BasicChart;
});
