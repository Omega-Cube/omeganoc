# This file is part of Omega Noc
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
# Kiril Gashteovski, kire_gasteovski@yahoo.com
# Xavier Roger-Machart, xrm@omegacube.fr
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

# Time series. We will take as an example the cpuUsage time series data

##########################################################################################
#                                     Inputs                                             #
##########################################################################################
# iData - An array of all the past points that should be taken into consideration        #
# iTwPoints - Amount of points to take up in the time window                             #
# iOutputLength - The amount of data points to be forecasted                             #
##########################################################################################

##########################################################################################
# 									 Settings											 #
##########################################################################################
# The period of 'check-in' (here it is every 6 check_interval)						     #
checkIn = 6																				 #
                                                                                         #
# The frequency of the time series  													 #
# Note: Fine-tuned to have a step value of 60 (one hour)                                 #
TSfrequency = 24																		 #
                                                                                         #
# The epsilo coefficient for the anomaly detection										 #
epsilon = 1e-5																			 #
                                                                                         #
# Confidence intervals for predictions													 #
confInterval = c(80, 95)																 #
##########################################################################################

# Loading the library "forecast"
library("forecast")

# Defining the time series, with frequency of for each hour
# We will use the variable 'fullData' where we will store the whole processed data
fullData = ts(iData, freq=TSfrequency)

# The time window data
twData = ts(fullData[(length(fullData) - iTwPoints + 1):length(fullData)], freq=TSfrequency)
twDataLength = length(twData)

# Check if there are missing values in the period (length - checkIn) : length and for anomaly
# If missing - interpolate
# If anomaly - interpolate the anomaly point
i = 0
d = dnorm(twData, mean=mean(twData), sd=sd(twData))
fullDataMean = mean(fullData)
fullDataSd = sd(fullData)
for (i in (twDataLength - checkIn + 1) : twDataLength){
    # Check for missing values
    if (is.na(twData[i])){
    # Linear interpolation
        twData = na.interp(twData)
        print(paste("Unknown value on the ", i, "-th point")) # TODO : Keep this ?
    }
    
    # Normal distribution for the anomaly detection
    d = dnorm(twData[i], mean=fullDataMean, sd=fullDataSd)
    if (d < epsilon){
        print(paste("Anomaly detection on the", i, "-th point, value: ", twData[i])) # TODO : Keep this ?
        
        # Initialize the anomaly point as NA
        twData[i] = NA
        
        # Interpolate
        twData = na.interp(twData)
    }
}

# STL decomposition object
stlDecomposedTWData = stl(twData, s.window = TSfrequency)

# The trend line
a = twDataLength + 1
b = 2 * twDataLength
twTrend = stlDecomposedTWData$time.series[a:b]

# STLF prediction
prediction = stlf(twData, h = iOutputLength, level = confInterval)

# Extract prediction data
pred_mean = prediction$mean
pred_lower = prediction$lower
pred_upper = prediction$upper
