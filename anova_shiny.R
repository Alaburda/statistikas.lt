library(shiny)
library(readxl)
library(dplyr)

ui <- fluidPage(
  titlePanel("Statistiniai testai per minutę!"),
  sidebarLayout(
    sidebarPanel(
      fileInput("file", "Choose a file to upload:", accept = ".xlsx"),
      br(),
      selectInput("column1", "Select a column for X:", choices = NULL, width = "100%"),
      selectInput("column2", "Select a column for Y:", choices = NULL, width = "100%"),
      selectInput("model_type", "Select a model type:", choices = c("ANOVA","Stjudento t-testas","Kruskal-Wallis"), selected = "ANOVA")
    ),
    mainPanel(
      tabsetPanel(
        tabPanel("Column Data",
                 dataTableOutput("data"),
                 plotOutput("histogram"),
                 p("This table displays the first 10 rows and the summarised data of the selected columns.")
        ),
        # tabPanel("Histogram",
        #          plotOutput("histogram"),
        #          p("This histogram displays the distribution of values in the selected column.")
        # ),
        tabPanel("Model Results",
                 verbatimTextOutput("model"),
                 p("This table displays the summary statistics of the selected model.")
        )
      )
    )
  ),
  # Add some Bootstrap theming
  tags$head(tags$style(HTML(".selectize-input { border-radius: 4px; }")))
)

server <- function(input, output, session) {
  # Read the uploaded file into a reactive dataframe
  uploaded_data <- reactive({
    req(input$file)
    df <- read_excel(input$file$datapath)
    df
  })

  # Update the column dropdowns with the column names of the uploaded file
  observe({
    updateSelectInput(session, "column1", choices = colnames(uploaded_data()), selected = NULL)
    updateSelectInput(session, "column2", choices = colnames(uploaded_data()), selected = NULL)
  })

  # Output the selected columns data
  output$data <- renderDataTable({
    req(input$file)
    req(input$column1)
    req(input$column2)
    data.frame(X = uploaded_data()[[input$column1]][1:10], Y = uploaded_data()[[input$column2]][1:10]) %>%
      bind_rows(summarise_at(uploaded_data(), input$column1, list(mean = mean, sd = sd, min = min, max = max)))
  })

  # Create a histogram of the selected column
  output$histogram <- renderPlot({
    req(input$file)
    req(input$column1)
    hist(uploaded_data()[[input$column1]], main = "Histogram", xlab = input$column1)
  })

  # Output the model results of the selected columns
  output$model <- renderPrint({
    req(input$file)
    req(input$column1)
    req(input$column2)
    if (input$model_type == "Linear Regression") {
      model <- lm(uploaded_data()[[input$column2]] ~ uploaded_data()[[input$column1]])
      summary(model)
    }

    if (input$model_type == "ANOVA") {
      model <- aov(uploaded_data()[[input$column2]] ~ uploaded_data()[[input$column1]])
      model <- summary(model)
    }

    if (input$model_type == "Kruskal-Wallis") {
      model <- kruskal.test(uploaded_data()[[input$column2]] ~ uploaded_data()[[input$column1]])
      model
    }

    return(model)


  })
}

shinyApp(ui = ui, server = server)
