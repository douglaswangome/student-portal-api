permissionset 90100 "DW Student API"
{
    Assignable = true;
    Caption = 'DW Student API';

    Permissions =
      codeunit "DW Student Service" = X,
      tabledata Customer = RIM,
      tabledata "ACA-Academics Central Setups" = R;
}