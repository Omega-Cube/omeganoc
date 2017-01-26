###################################################################################################
#       INPUTS                                                                                    #
###################################################################################################
# iData - A list of data point values                                                             #
###################################################################################################

###################################################################################################
#       OUTPUTS                                                                                   #
###################################################################################################
# cpList - A list of indexes in the iData vector where a behavioral change has been detected      #
###################################################################################################

###################################################################################################
#       Parameters                                                                                #
###################################################################################################
# Epsilon. We will replace the values of the zero, negative or unknown values with epsilon        #
epsilon = 1e-5                                                                                    #
                                                                                                  #
# The frequency of the time series                                                                #
TSfrequency = 1                                                                                   #
###################################################################################################

# Loading the library "forecast"
library("changepoint")
library("forecast")

# Defining the time series, with frequency of for each day
# We will use the variable 'fullData' where we will store the whole processed data
fullData = ts(iData, frequency=TSfrequency)

# Clear the data from 0, negative and unknown values
for (i in 1:length(fullData)){
  if (fullData[i] < 0 || fullData[i] == 0){ 
    fullData[i] = epsilon
  }
  if (is.na(fullData[i])){
    fullData = na.interp(fullData)
  }
}

# Find the change points based on the mean and the variance changes
cp = cpt.meanvar(fullData, penalty="BIC", method="PELT", test.stat = "Exponential")

# The list of change points
cpList = cp@cpts
