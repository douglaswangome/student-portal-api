permissionset 90100 "DW Student API"
{
    Assignable = true;
    Caption = 'DW Student API';

    Permissions =
        codeunit "DW Student Service" = X, // X = Execute, R = Read, W = Write, D = Delete
        report "Student Fee Statement 2" = X,
        tabledata Customer = RIM, // R = Read, I = Insert, M = Modify, D = Delete
        tabledata "ACA-Academics Central Setups" = R,
        tabledata "Detailed Cust. Ledg. Entry" = R,
        tabledata "Cust. Ledger Entry" = R,
        tabledata "Company Information" = R,
        tabledata "ACA-Course Registration" = R,
        tabledata "ACA-Programme" = R;
}