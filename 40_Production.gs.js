/************************************************************
 * 40_Production.gs
 * Production workbook sheet setup
 ************************************************************/

function pcCreateProductionSheets() {
  const ss = pcGetProductionSS_();

  pcEnsureSheet_(ss, "Form_Responses_Raw").setFrozenRows(1);

  pcWriteHeaders_(pcEnsureSheet_(ss, "Orders"), [
    "Order_ID","Order_Date","Lab_ID","Lab_Name","Product_ID","Product_Name",
    "Quantity","Unit_Selling_Price","Total_Amount","Invoice_ID","Invoice_Status",
    "Payment_Status","Contact_Person","Mobile_Number","Email_Address",
    "Delivery_Address","Notes","Created_At"
  ]);

  pcWriteHeaders_(pcEnsureSheet_(ss, "Order_Lines"), [
    "Order_Line_ID","Order_ID","Invoice_ID","Order_Date","Lab_ID","Product_ID",
    "Product_Name","Quantity","Unit_Selling_Price","Line_Total","Tax_Rate",
    "Tax_Amount","Net_Line_Total","Created_At"
  ]);

  pcWriteHeaders_(pcEnsureSheet_(ss, "Invoice_Register"), [
    "Invoice_ID","Invoice_Date","Order_ID","Lab_ID","Lab_Name","Email_Address",
    "Mobile_Number","Invoice_Total","Invoice_PDF_File_ID","Invoice_PDF_Link",
    "Email_Sent_To_Lab","Email_Sent_To_Owner","WhatsApp_Message_Text",
    "ERP_Export_Status","Salesforce_Export_Status","Created_At"
  ]);

  pcWriteHeaders_(pcEnsureSheet_(ss, "Inventory"), [
    "Product_ID","Product_Name","Current_Stock","Min_Stock","Reorder_Qty",
    "Reorder_Status","Opening_Stock","Stock_In","Stock_Out","Last_Updated",
    "Avg_Daily_Sales_30D","Lead_Time_Days","Safety_Days","Unit_Cost"
  ]);

  pcWriteHeaders_(pcEnsureSheet_(ss, "AR_Credit_Control"), [
    "Lab_ID","Lab_Name","Total_Delivered","Total_Paid","Outstanding",
    "Credit_Limit","Days_Overdue","Allowed_Overdue_Days","Credit_Hold",
    "Last_Follow_Up_Date","Collections_Notes"
  ]);

  pcWriteHeaders_(pcEnsureSheet_(ss, "Product_Master"), [
    "Product_ID","Product_Name","Unit_Selling_Price","Tax_Rate",
    "Unit_Cost","Category","Brand","Active_Flag"
  ]);

  pcWriteHeaders_(pcEnsureSheet_(ss, "Settings"), [
    "Key","Value"
  ]);

  pcWriteHeaders_(pcEnsureSheet_(ss, "ERP_Export"), [
    "Invoice_ID","Invoice_Date","Order_ID","Lab_ID","Lab_Name","Product_ID",
    "Product_Name","Quantity","Unit_Selling_Price","Tax_Rate","Tax_Amount",
    "Line_Total","Net_Line_Total","Payment_Status","Invoice_PDF_Link","Exported_At"
  ]);

  pcWriteHeaders_(pcEnsureSheet_(ss, "Salesforce_Export"), [
    "External_Order_ID","External_Invoice_ID","Account_External_ID","Account_Name",
    "Contact_Email","Contact_Mobile","Product_External_ID","Quantity","Unit_Price",
    "Invoice_Total","Order_Date","Invoice_Date","PDF_Link","Exported_At"
  ]);

  SpreadsheetApp.getUi().alert("Production sheets created.");
}